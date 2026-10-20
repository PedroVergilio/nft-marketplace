import { expect, test as base } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type { Cart, DemoControl, Nft, OrderStatus, Quote } from '../src/lib/contracts'

export const credentials = { alice: 'alice@orbit.test', bruno: 'bruno@orbit.test', password: 'Orbit123!' }
export interface DemoState {
  scenario: DemoControl['scenario']
  orderCount: number
  sessionCount: number
  carts: Record<string, Cart>
  nfts: Nft[]
  orders: { id: string; userId: string; status: OrderStatus; version: number; total: string; items: Quote['items'] }[]
}

export const test = base.extend({
  page: async ({ page }, use) => {
    // Playwright creates a fresh browser context (and MSW storage) for every test.
    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.locator('.nft-grid .nft-card').first()).toBeVisible()
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await expect(page.locator('.live-badge')).toHaveText('Ao vivo')
    await use(page)
  },
})
export { expect }

export async function demo(page: Page, control: Partial<DemoControl> = {}) {
  await expect(page.locator('main')).toBeVisible()
  const result = await page.evaluate(async (body) => {
    const response = await fetch('/api/__demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.text() }
  }, { scenario: 'default', ...control } satisfies DemoControl)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
}

export async function state(page: Page): Promise<DemoState> {
  await expect(page.locator('main')).toBeVisible()
  return page.evaluate(async () => {
    const response = await fetch('/api/__demo/state')
    if (!response.ok) throw new Error(`MSW diagnostics returned ${response.status}`)
    return response.json()
  })
}

export async function login(page: Page, user: 'alice' | 'bruno' = 'alice', returnTo = '/', password = credentials.password) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  await page.getByLabel('E-mail', { exact: true }).fill(credentials[user])
  await page.getByLabel('Senha', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar na conta', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${escapeRegex(returnTo)}(?:\\?|$)`))
  await expect(page.getByRole('button', { name: 'Entrar na conta', exact: true })).toHaveCount(0)
  await dismissNotices(page)
}

export async function logout(page: Page) {
  await expect(page.locator('main')).toBeVisible()
  const headerExit = page.locator('.site-header').getByRole('button', { name: 'Sair', exact: true })
  if (await headerExit.isVisible()) {
    await headerExit.click()
  } else {
    await page.goto('/profile')
    await page.locator('.account-sidebar').getByRole('button', { name: 'Sair', exact: true }).click()
  }
  await expect(page).toHaveURL(/\/(?:\?|$)/)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('orbit:token'))).toBeNull()
}

export async function addToCart(page: Page, options: { nftId?: string; edition?: string; quantity?: number } = {}) {
  const { nftId = 'cosmic-001', edition = 'print', quantity = 1 } = options
  await page.goto(`/nft/${nftId}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await dismissNotices(page)
  await page.locator(`.edition-picker input[value="${edition}"]`).check()
  await page.getByLabel('Quantidade', { exact: true }).fill(String(quantity))
  await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: false }).click()
  await expect(page.getByText('Obra adicionada ao carrinho.', { exact: true })).toBeVisible()
}

export async function checkout(page: Page, options: { scenario?: DemoControl['scenario']; quantity?: number } = {}) {
  await login(page)
  await addToCart(page, { quantity: options.quantity ?? 1 })
  if (options.scenario) await demo(page, { scenario: options.scenario })
  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: 'Dados do colecionador', exact: true })).toBeVisible()
}

export async function connect(page: Page) {
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Conectar carteira', exact: true }).getByRole('button', { name: 'Autorizar conexão simulada', exact: true }).click()
  await expect(page.getByText('Carteira conectada (simulada)', { exact: true })).toBeVisible()
}

export async function review(page: Page) {
  await connect(page)
  await page.getByRole('button', { name: 'Revisar pedido', exact: false }).click()
  await expect(page.getByRole('region', { name: 'Revisão do pedido', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar pagamento', exact: false })).toBeEnabled()
}

export async function confirm(page: Page) {
  await page.getByRole('button', { name: 'Confirmar pagamento', exact: false }).click()
  await expect(page).toHaveURL(/\/order\/[^/?]+/)
  return new URL(page.url()).pathname.split('/').pop()!
}

export async function receipt(page: Page) {
  await expect(page.getByRole('heading', { name: 'Recibo do pedido', exact: true })).toBeVisible()
  await expect(page.getByText('Pagamento confirmado. Sua coleção ganhou um novo significado.', { exact: true })).toBeVisible()
}

export async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1)
}

export async function focusInside(page: Page, dialog: Locator) {
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab')
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
}

export async function dismissNotices(page: Page) {
  const close = page.getByRole('button', { name: 'Dispensar notificação', exact: true })
  while (await close.count()) await close.first().click()
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
