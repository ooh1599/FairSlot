import { chromium } from '@playwright/test'

// Dev helper: saves screenshots of public pages for visual review. Not part of the test run.
const base = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const browser = await chromium.launch()
for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
] as const) {
  const page = await browser.newPage({ viewport })
  for (const path of ['/', '/login', '/events/fs_0123456789abcdefghjk']) {
    await page.goto(base + path)
    await page.waitForTimeout(800)
    const file = `/tmp/shot-${name}-${path === '/' ? 'home' : path.split('/')[1]}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log(file)
  }
  await page.close()
}
await browser.close()
