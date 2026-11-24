import { expect, test } from '@playwright/test'

test.describe('public pages', () => {
  test('landing renders in English (US) by default, switches to Thai and has no horizontal overflow', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Lock the list/i)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await page.getByRole('button', { name: /language|ภาษา/i }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ล็อกรายชื่อก่อน')
    await expect(page.locator('html')).toHaveAttribute('lang', 'th')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ล็อกรายชื่อก่อน')
  })

  test('event lookup rejects a malformed ID and accepts a well-formed one', async ({ page }) => {
    await page.goto('/')
    const input = page.locator('#lookup')
    await input.fill('not-an-event')
    await input.press('Enter')
    await expect(page.getByText(/ไม่ถูกต้อง|not valid/i).first()).toBeVisible()
    await input.fill('https://example.com/events/fs_0123456789abcdefghjk?x=1')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/events\/fs_0123456789abcdefghjk$/)
  })

  test('organizer pages ask for sign-in or backend setup instead of failing', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('main')).toContainText(/เข้าสู่ระบบ|ระบบหลังบ้าน|sign in|backend/i)
  })

  test('chain verify page validates input and reports an unknown transaction', async ({ page }) => {
    await page.goto('/verify')
    const input = page.locator('#vc-input')
    await expect(input).toBeVisible()
    await input.fill('0x123')
    await input.press('Enter')
    await expect(page.getByRole('alert')).toBeVisible()
    await input.fill('0x' + '11'.repeat(32))
    await input.press('Enter')
    await expect(page.getByRole('alert')).toContainText(/ไม่พบ|No FairSlot/i, { timeout: 20_000 })
  })

  test('unknown routes show the not found page', async ({ page }) => {
    await page.goto('/this/does/not/exist')
    await expect(page.locator('main')).toContainText(/404|ไม่พบ|not found/i)
  })
})
