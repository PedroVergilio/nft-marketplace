import type { Page } from '@playwright/test'
import { test, expect, addToCart, checkout, dismissNotices } from './helpers'

async function stable(page: Page) {
  await dismissNotices(page)
  await expect(page.getByRole('status', { name: 'Carregando conteúdo', exact: true })).toHaveCount(0)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(Array.from(document.images, async (image) => {
      if (image.loading === 'lazy') image.loading = 'eager'
      await image.decode()
    }))
  })
  await expect(page.locator('.live-badge')).toHaveText('Ao vivo')
}

test.describe('@visual · baselines reais e versionáveis', () => {
  test('início', async ({ page }) => {
    await stable(page)
    await expect(page).toHaveScreenshot('home.png', { fullPage: true })
  })

  test('detalhe', async ({ page }) => {
    await page.goto('/nft/cosmic-001')
    await expect(page.getByRole('group', { name: 'Edição', exact: true })).toBeVisible()
    await stable(page)
    await expect(page).toHaveScreenshot('detail.png', { fullPage: true })
  })

  test('carrinho', async ({ page }) => {
    await addToCart(page, { quantity: 2 })
    await page.goto('/cart')
    await expect(page.getByTestId('quote-total')).toHaveText('0.243 ETH')
    await stable(page)
    await expect(page).toHaveScreenshot('cart.png', { fullPage: true })
  })

  test('pagamento', async ({ page }) => {
    await checkout(page, { quantity: 2 })
    await expect(page.getByTestId('quote-total')).toHaveText('0.243 ETH')
    await stable(page)
    await expect(page).toHaveScreenshot('checkout.png', { fullPage: true })
  })
})
