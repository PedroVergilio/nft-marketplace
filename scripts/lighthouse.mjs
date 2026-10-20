import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'
import config, { pages, profiles, runs, targets } from '../lighthouse.config.mjs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'reports', 'lighthouse')
const baseURL = new URL(process.env.LIGHTHOUSE_BASE_URL || 'http://127.0.0.1:4174')
const externalServer = !!process.env.LIGHTHOUSE_BASE_URL
const executable = chromium.executablePath()
let server
let chrome
let serverLog = ''

function startPreview() {
  if (externalServer) return
  const args = ['run', 'preview', '--', '--port', '4174', '--strictPort']
  // npm.cmd cannot be spawned directly without cmd.exe on Windows.
  server = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn('npm', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (data) => { serverLog = (serverLog + data.toString()).slice(-12_000) })
  }
  server.on('error', (error) => { serverLog += `\n${error.message}` })
}

async function healthy() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server && server.exitCode !== null) throw new Error(`Preview exited: ${serverLog}`)
    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(1_000) })
      const html = await response.text()
      if (response.ok && html.includes('id="root"')) {
        if (html.includes('/@vite/client')) throw new Error('Lighthouse requires optimized preview, not Vite development server.')
        return
      }
    } catch (error) {
      if (error.message.includes('optimized preview')) throw error
    }
    await delay(500)
  }
  throw new Error(`Preview not responsive at ${baseURL.href}\n${serverLog}`)
}

async function stopPreview() {
  if (!server?.pid || server.exitCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const command = `function Stop-Tree([int]$processId) { Get-CimInstance Win32_Process -Filter "ParentProcessId=$processId" | ForEach-Object { Stop-Tree $_.ProcessId }; Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }; Stop-Tree ${server.pid}`
      const stop = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: 'ignore' })
      stop.on('error', resolve)
      stop.on('close', resolve)
    })
  } else {
    server.kill('SIGTERM')
  }
}

function median(values) {
  if (values.length !== runs || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return null
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

function metrics(lhr) {
  return {
    lcpMs: lhr.audits['largest-contentful-paint']?.numericValue ?? null,
    cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? null,
    tbtMs: lhr.audits['total-blocking-time']?.numericValue ?? null,
  }
}

await mkdir(output, { recursive: true })
const summary = {
  startedAt: new Date().toISOString(),
  baseURL: baseURL.href,
  environment: {
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    logicalCPUs: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 1024 ** 3),
    node: process.version,
    playwright: require('@playwright/test/package.json').version,
    lighthouse: require('lighthouse/package.json').version,
    chromiumExecutable: executable,
  },
  conditions: {
    server: externalServer ? 'externally provided optimized build' : 'npm run preview, existing dist build',
    runsPerPageAndProfile: runs,
    profiles,
    network: 'Lighthouse simulated throttling; REST and Socket.IO use the unchanged default browser MSW scenario',
    storage: 'Fresh Chromium profile per run; normal application assets, fonts and UI; no route blocking or audit-only scenario',
  },
  targets,
  results: [],
}

try {
  if (!externalServer) {
    const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8')
    if (!html.includes('/assets/')) throw new Error('Run npm run build before npm run audit.')
  }
  startPreview()
  await healthy()
  for (const page of pages) {
    for (const [profile, settings] of Object.entries(profiles)) {
      const measurements = []
      for (let run = 1; run <= runs; run++) {
        const basename = `${page.name}-${profile}-${run}`
        const userDataDir = path.join(output, `.chrome-${basename}`)
        await mkdir(userDataDir, { recursive: true })
        try {
          chrome = await launch({
            chromePath: executable, userDataDir, handleSIGINT: false,
            chromeFlags: ['--headless=new', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check'],
            logLevel: 'silent',
          })
          const result = await lighthouse(new URL(page.path, baseURL).href, {
            port: chrome.port, output: ['html', 'json'], logLevel: 'error',
          }, { ...config, settings: { ...config.settings, ...settings } })
          if (!result) throw new Error(`No Lighthouse result for ${basename}`)
          const reports = Array.isArray(result.report) ? result.report : [result.report]
          for (const [index, extension] of ['html', 'json'].entries()) {
            await writeFile(path.join(output, `${basename}.${extension}`), reports[index], 'utf8')
          }
          const { lhr } = result
          summary.environment.chromium = lhr.environment.hostUserAgent
          const categories = Object.fromEntries(Object.keys(targets).map((key) => [key, lhr.categories[key]?.score == null ? null : lhr.categories[key].score * 100]))
          const failedAudits = Object.values(lhr.audits).filter((audit) => audit.score !== null && audit.score < 1)
            .map((audit) => ({ id: audit.id, title: audit.title, score: audit.score, displayValue: audit.displayValue, explanation: audit.explanation }))
          measurements.push({ run, categories, ...metrics(lhr), runtimeError: lhr.runtimeError, warnings: lhr.runWarnings, failedAudits })
          console.log(`${basename}: ${Object.entries(categories).map(([key, value]) => `${key}=${value}`).join(', ')}`)
          if (lhr.runtimeError) process.exitCode = 1
        } finally {
          await chrome?.kill()
          chrome = undefined
          await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
        }
      }
      const categories = Object.fromEntries(Object.keys(targets).map((key) => [key, median(measurements.map((run) => run.categories[key]))]))
      summary.results.push({
        page: page.name, path: page.path, profile, measurements,
        median: { categories, ...Object.fromEntries(['lcpMs', 'cls', 'tbtMs'].map((key) => [key, median(measurements.map((run) => run[key]))])) },
        belowTarget: Object.entries(targets).filter(([key, target]) => categories[key] === null || categories[key] < target).map(([key]) => key),
      })
      await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8')
    }
  }
  summary.finishedAt = new Date().toISOString()
  console.log(`12 medições concluídas. Relatórios reais e medianas: ${output}`)
} catch (error) {
  summary.error = error instanceof Error ? error.stack : String(error)
  process.exitCode = 1
  console.error(error)
} finally {
  await chrome?.kill()
  await stopPreview()
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8')
}
