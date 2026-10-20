import { expect, test } from '@playwright/test'

test('fundação: Router, Axios/Query/MSW, shadcn e Socket.IO reais', async ({ page }) => {
  const responsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/nfts' && response.request().method() === 'GET',
  )
  await page.goto('/')
  const response = await responsePromise
  expect(response.ok()).toBe(true)
  expect((await response.json()).items).toHaveLength(9)
  await expect(page.locator('.nft-grid .nft-card')).toHaveCount(9)
  await expect(page.locator('.live-badge')).toHaveText('Ao vivo')
  await expect(page.locator('.nft-grid button[data-slot="button"]').first()).toBeVisible()
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.locator('.nft-grid .nft-card').first().getByRole('link', { name: 'Ver Emerald Ape #042', exact: true }).click()
  await expect(page).toHaveURL(/\/nft\/cosmic-001$/)
  await expect(page.getByRole('heading', { name: 'Emerald Ape #042', exact: true })).toBeVisible()

  const changed = await page.evaluate(async () => {
    const response = await fetch('/api/__demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: 'default', action: 'nft-update',
        nftId: 'cosmic-001', editionId: 'original', price: '0.75',
      }),
    })
    return response.ok
  })
  expect(changed).toBe(true)
  await expect(page.locator('.detail-price')).toHaveText('0.75 ETH')
})

test('HTML recebido da API informa configuração inválida sem derrubar o shell e permite recuperar', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.nft-grid .nft-card')).toHaveCount(9)
  const scenarioStatus = await page.evaluate(async () => {
    const response = await fetch('/api/__demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'invalid-response' }),
    })
    return response.status
  })
  expect(scenarioStatus).toBe(200)
  await page.reload()
  const error = page.getByRole('alert')
  await expect(error).toContainText('A API retornou uma resposta inválida em vez de JSON.')
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.locator('.site-header')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Kurio — início', exact: true, includeHidden: true })).toHaveCount(1)
  await expect(page.getByText(/Cannot read properties of undefined/)).toHaveCount(0)

  await page.evaluate(async () => {
    const response = await fetch('/api/__demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'default' }),
    })
    if (!response.ok) throw new Error('Não foi possível restaurar o cenário.')
  })
  await error.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await expect(page.locator('.nft-grid .nft-card')).toHaveCount(9)
  await expect(error).toHaveCount(0)
})
