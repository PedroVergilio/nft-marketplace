import type { Page, TestInfo } from '@playwright/test'
import { test, expect, addToCart, confirm, demo, dismissNotices, focusInside, login, noOverflow, receipt, review } from './helpers'

async function capture(page: Page, info: TestInfo, name: string) {
  await dismissNotices(page)
  await expect(page.getByRole('status', { name: 'Carregando conteúdo', exact: true })).toHaveCount(0)
  await page.evaluate(async () => {
    window.scrollTo(0, 0)
    await document.fonts.ready
    await Promise.all(Array.from(document.images, async (image) => {
      image.loading = 'eager'
      await image.decode()
    }))
  })
  await noOverflow(page)
  for (const dialog of await page.getByRole('dialog').all()) {
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  }
  const image = await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
  await info.attach(name, { body: image, contentType: 'image/png' })
}

test.describe('Kurio · telas e composição responsiva', () => {
  for (const width of [390, 414, 768, 1440]) {
    test(`nove telas e compra integrada em ${width}px`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'Os quatro tamanhos são medidos uma vez, com contextos isolados.')
      test.setTimeout(180_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize({ width, height: width < 600 ? 896 : 1080 })
      await page.goto('/')
      await expect(page.locator('.nft-grid .nft-card')).toHaveCount(9)
      const columns = await page.locator('.nft-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
      expect(columns).toBe(width < 600 ? 2 : 3)
      await capture(page, info, 'inicio')
      if (width < 600) {
        const explore = page.getByRole('button', { name: 'Explorar coleções', exact: true })
        await explore.click()
        const dialog = page.getByRole('dialog', { name: 'Explorar coleções', exact: true })
        await focusInside(page, dialog)
        await page.keyboard.press('Escape')
        await expect(explore).toBeFocused()
      }
      await page.goto('/nft/cosmic-001')
      await expect(page.getByRole('heading', { name: 'Emerald Ape #042', exact: true })).toBeVisible()
      await capture(page, info, 'detalhe')
      await page.goto('/login')
      await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible()
      await focusInside(page, page.getByRole('dialog', { name: 'Entrar', exact: true }))
      await capture(page, info, 'login')
      await page.keyboard.press('Escape')
      await expect(page).toHaveURL(/\/(?:\?|$)/)
      await page.goto('/register')
      await expect(page.getByLabel('Confirmar senha', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Nome de usuário', { exact: true })).toBeDisabled()
      await capture(page, info, 'cadastro')
      await login(page, 'alice', '/profile')
      await expect(page.getByRole('button', { name: 'Salvar perfil', exact: true })).toBeVisible()
      await capture(page, info, 'perfil')
      await page.goto('/wallets')
      await expect(page.getByRole('button', { name: 'Adicionar carteira', exact: true })).toBeVisible()
      await capture(page, info, 'carteiras')
      await addToCart(page, { quantity: 2 })
      await page.goto('/cart')
      await expect(page.getByTestId('quote-total')).toHaveText('0.243 ETH')
      await capture(page, info, 'carrinho')
      await page.goto('/checkout')
      await expect(page.getByLabel('Nome completo', { exact: true })).toBeVisible()
      await expect(page.getByRole('radio', { name: 'MetaMask · indisponível', exact: true })).toBeDisabled()
      await review(page)
      if (width < 600) {
        const confirmButton = await page.getByRole('button', { name: 'Confirmar pagamento', exact: false }).boundingBox()
        expect(confirmButton).not.toBeNull()
        expect(confirmButton!.y + confirmButton!.height).toBeLessThanOrEqual(896)
      }
      await capture(page, info, 'pagamento')
      const order = await confirm(page)
      await receipt(page)
      await capture(page, info, 'confirmacao')
      await page.reload()
      await receipt(page)
      await expect(page.locator('.receipt')).toContainText(order)
      await demo(page, { action: 'nft-update', nftId: 'cosmic-001', editionId: 'print', price: '5' })
      await expect(page.getByTestId('quote-total')).toHaveText('0.243 ETH')
      expect(errors).toEqual([])
    })
  }
})
