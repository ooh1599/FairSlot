import { expect, test } from '@playwright/test'
import { installFakeSupabase } from './fakeSupabase'

const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `/tmp/flow-${name}.png`, fullPage: true })
}

// Organizer journey up to the wallet step, against an in-memory stand-in for Supabase.
// Wallet signing and the chain are covered by contract, fork and live-testnet tests.
test('organizer creates a draft, imports a CSV, reviews it and reaches the wallet step', async ({ page }) => {
  const db = await installFakeSupabase(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/events/new')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // Details
  await page.locator('#title').fill('Launch party giveaway')
  await page.locator('#description').fill('Win a gift bag.')
  await page.locator('#rules').fill('One entry per person.')
  await page.locator('#drawAt').fill('2031-01-15T12:00')
  await page.getByRole('button', { name: 'Next' }).click()

  // Prizes
  await page.locator('#winners').fill('2')
  await page.locator('#reserves').fill('1')
  await page.getByLabel('Prize for winner 1').fill('Gift bag')
  await page.getByLabel('Prize for winner 2').fill('Sticker pack')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/events\/fs_[0-9a-hjkmnp-tv-z]{20}\/manage$/)
  expect(db.tables.events).toHaveLength(1)
  expect(db.tables.events[0].winner_count).toBe(2)
  expect(db.tables.events[0].prizes).toEqual([{ rank: 1, name: 'Gift bag' }, { rank: 2, name: 'Sticker pack' }])

  // Entries: the sample file has two bad rows (duplicate ID, bad email) that must be skipped.
  await page.locator('#csv').setInputFiles('docs/sample-participants.csv')
  await expect(page.getByText(/9 usable rows, 2 with errors/)).toBeVisible()
  await page.getByRole('button', { name: /Import 9 rows/ }).click()
  await expect(page.getByText(/Imported 9 rows/)).toBeVisible()
  expect(db.tables.entries).toHaveLength(9)
  for (const e of db.tables.entries) expect(String(e.public_entry_id)).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)

  await shot(page, 'entries')

  // Importing the same file again must not create duplicates.
  await page.locator('#csv').setInputFiles('docs/sample-participants.csv')
  await page.getByRole('button', { name: /Import 9 rows/ }).click()
  await expect(page.getByText(/skipped 9/)).toBeVisible()
  expect(db.tables.entries).toHaveLength(9)

  // Review
  await page.getByRole('button', { name: /Review|Continue|Next/ }).first().click()
  await expect(page.getByText('Review before locking')).toBeVisible()
  const goLock = page.getByRole('button', { name: 'Go to locking' })
  await expect(goLock).toBeDisabled()
  await shot(page, 'review')
  await page.getByRole('checkbox').check()
  await expect(goLock).toBeEnabled()
  await goLock.click()

  // Lock step asks for a wallet instead of failing.
  await expect(page.getByText('Lock and publish').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Connect wallet/i })).toBeVisible()

  await shot(page, 'lock')

  // The event shows up on the dashboard.
  await page.goto('/dashboard')
  await expect(page.getByText('Launch party giveaway')).toBeVisible()
  await shot(page, 'dashboard')
  expect(errors).toEqual([])
})
