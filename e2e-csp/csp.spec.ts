import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

interface HeaderRule {
  source: string
  headers: { key: string; value: string }[]
}

// The policy that ships in vercel.json (report-only value), applied here as an enforced header.
const rules = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: HeaderRule[] }).headers
const all = rules.find((r) => r.source === '/(.*)')?.headers ?? []
const enforced = all.find((h) => h.key === 'Content-Security-Policy')?.value
if (!enforced) throw new Error('No enforced Content-Security-Policy in vercel.json')
const policy = enforced

test('the policy is actually enforced (negative control)', async ({ page }) => {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': enforced } })
  })
  await page.goto('/')
  const ran = await page.evaluate(() => {
    const s = document.createElement('script')
    s.textContent = 'window.__injected = true'
    document.head.appendChild(s)
    return Boolean((window as unknown as { __injected?: boolean }).__injected)
  })
  expect(ran).toBe(false)
})

const PAGES = ['/', '/verify', '/login', '/events/fs_0123456789abcdefghjk', '/dashboard']

test.describe('pages work under the enforced Content-Security-Policy', () => {
  for (const path of PAGES) {
    test(`no violations on ${path}`, async ({ page }) => {
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue()
        const response = await route.fetch()
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } })
      })
      const violations: string[] = []
      page.on('console', (msg) => {
        if (/content security policy/i.test(msg.text())) violations.push(msg.text())
      })
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`)
        })
      })
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('main')).toBeVisible()
      expect(violations, violations.join('\n')).toEqual([])
    })
  }
})
