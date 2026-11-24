import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { FAKE_USER, installFakeSupabase } from './fakeSupabase'

/** With E2E_CSP=1 (production build) the enforced Content-Security-Policy from vercel.json is applied to every page. */
async function applyCspFromVercelJson(page: Page) {
  const rules = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }).headers
  const h = rules.find((r) => r.source === '/(.*)')?.headers ?? []
  const policy = (h.find((x) => x.key === 'Content-Security-Policy')?.value ?? '')
    // The only change: allow the in-memory Supabase stand-in, which is not a *.supabase.co host.
    .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:54321")
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } })
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`))
  })
}

const ACCOUNT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

/** A minimal injected wallet (EIP-1193). It signs nothing for real: it returns fixed values the app can only check for shape. */
async function installFakeWallet(page: Page, chainId: number) {
  await page.addInitScript(
    ([account, id]) => {
      let currentChain = Number(id)
      const listeners: Record<string, ((...a: unknown[]) => void)[]> = {}
      const provider = {
        isMetaMask: true,
        request: ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return Promise.resolve([account])
            case 'eth_chainId':
              return Promise.resolve('0x' + currentChain.toString(16))
            case 'net_version':
              return Promise.resolve(String(currentChain))
            case 'wallet_switchEthereumChain': {
              currentChain = parseInt((params?.[0] as { chainId: string }).chainId, 16)
              ;(listeners['chainChanged'] ?? []).forEach((f) => f('0x' + currentChain.toString(16)))
              return Promise.resolve(null)
            }
            case 'personal_sign':
              return Promise.resolve('0x' + '11'.repeat(65))
            default:
              return Promise.reject(new Error('unsupported in test wallet: ' + method))
          }
        },
        on: (event: string, fn: (...a: unknown[]) => void) => {
          ;(listeners[event] ??= []).push(fn)
        },
        removeListener: () => undefined,
      }
      ;(window as unknown as { ethereum: unknown }).ethereum = provider
    },
    [ACCOUNT, chainId],
  )
}

test('connecting a wallet that starts on another network ends on Arc and asks to prove ownership', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (m) => {
    if (/CSP violation|content security policy/i.test(m.text())) violations.push(m.text())
  })
  if (process.env.E2E_CSP) await applyCspFromVercelJson(page)
  const db = await installFakeSupabase(page)
  await installFakeWallet(page, 1) // Ethereum mainnet: not the network the app uses

  // Seed a locked-ready draft directly.
  const id = 'fs_0123456789abcdefghjk'
  db.tables.events.push({
    id: '22222222-2222-4222-8222-222222222222', public_id: id, organizer_id: FAKE_USER.id, title: 'Wallet test', description: '', rules: '',
    prizes: [{ rank: 1, name: 'Prize' }], winner_count: 1, reserve_count: 0, draw_not_before: '2031-01-15T05:00:00Z', status: 'draft',
    created_at: new Date().toISOString(), organizer_wallet: null, manifest_hash: null, manifest_uri: null,
  })
  for (let i = 0; i < 3; i++) {
    db.tables.entries.push({ id: crypto.randomUUID(), event_id: '22222222-2222-4222-8222-222222222222', public_entry_id: `AAAA-BBBB-CCC${i}`, external_id: String(i), display_name: `P${i}`, email: null })
  }

  // The server side of wallet verification is a Vercel function; answer it here.
  let signed = false
  await page.route('**/api/wallet**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('step') === 'nonce') {
      return route.fulfill({ json: { nonce: 'abc', message: 'FairSlot wallet verification\nNonce: abc' } })
    }
    signed = true
    db.tables.organizer_wallets.push({ address: ACCOUNT.toLowerCase(), verified_at: new Date().toISOString(), user_id: FAKE_USER.id })
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto(`/events/${id}/manage`)
  await page.getByRole('button', { name: 'Next' }).click() // entries -> review
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Go to locking' }).click()

  await page.getByRole('button', { name: /Connect wallet/i }).click()
  // ConnectKit lists the injected wallet; pick the first wallet option in the dialog.
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByText(/MetaMask|Browser Wallet|Injected|Test Wallet/i).first().click()

  // The wallet starts on another network. Either the connection moves it to Arc by itself, or the app must
  // say "Wrong network" and offer a switch. It must never go on to ask for a signature on the wrong network.
  const sign = page.getByText('Prove this wallet is yours')
  const wrong = page.getByText('Wrong network')
  await expect(sign.or(wrong)).toBeVisible({ timeout: 15_000 })
  if (await wrong.isVisible()) {
    await expect(sign).toBeHidden()
    await page.getByRole('button', { name: /Switch to Arc/i }).click()
  }

  // Right network, wallet not yet linked: ask for a signature.
  await expect(page.getByText('Prove this wallet is yours')).toBeVisible()
  await page.getByRole('button', { name: 'Sign verification message' }).click()
  await expect.poll(() => signed).toBe(true)
  await expect(page.getByText(/is ready/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Publish and lock the list/i })).toBeVisible()
  expect(violations, violations.join('\n')).toEqual([])
})
