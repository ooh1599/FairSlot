import { chromium } from '@playwright/test'
const [url, out] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
await page.goto(url)
await page.waitForTimeout(9000)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
