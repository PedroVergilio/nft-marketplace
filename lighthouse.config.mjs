export const targets = { performance: 90, accessibility: 95, 'best-practices': 95, seo: 90 }
export const pages = [
  { name: 'home', path: '/' },
  { name: 'detail', path: '/nft/cosmic-001' },
]
export const runs = 3
export const profiles = {
  desktop: {
    formFactor: 'desktop',
    screenEmulation: { mobile: false, width: 1440, height: 1000, deviceScaleFactor: 1, disabled: false },
    throttling: { rttMs: 40, throughputKbps: 10_240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
  },
  mobile: {
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 1, disabled: false },
    throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4, requestLatencyMs: 562.5, downloadThroughputKbps: 1474.56, uploadThroughputKbps: 675 },
  },
}

export default {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: Object.keys(targets),
    throttlingMethod: 'simulate',
    emulatedUserAgent: true,
    locale: 'pt-BR',
    maxWaitForFcp: 30_000,
    maxWaitForLoad: 60_000,
  },
}
