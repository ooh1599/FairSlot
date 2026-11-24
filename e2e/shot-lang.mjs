import { chromium } from '@playwright/test'
const [url, out, lang, w, h] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } })
await page.addInitScript((l) => localStorage.setItem('fairslot.lang', l), lang)
await page.goto(url)
await page.waitForTimeout(3500)
await page.screenshot({ path: out, fullPage: false })
await browser.close()
