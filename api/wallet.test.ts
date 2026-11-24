import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyMessage } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({ nonces: [] as Row[], wallets: [] as Row[], user: 'user-1' }))

class Q {
  private filters: [string, string, unknown][] = []
  private mode: 'select' | 'delete' = 'select'
  private head = false
  constructor(private table: 'wallet_nonces' | 'organizer_wallets') {}
  private rows() {
    return this.table === 'wallet_nonces' ? state.nonces : state.wallets
  }
  select(_c?: string, opts?: { head?: boolean }) {
    this.head = Boolean(opts?.head)
    return this
  }
  delete() {
    this.mode = 'delete'
    return this
  }
  eq(k: string, v: unknown) {
    this.filters.push(['eq', k, v])
    return this
  }
  lt(k: string, v: unknown) {
    this.filters.push(['lt', k, v])
    return this
  }
  insert(row: Row) {
    this.rows().push(row)
    return Promise.resolve({ error: null })
  }
  upsert(row: Row) {
    this.rows().push(row)
    return Promise.resolve({ error: null })
  }
  private matched() {
    return this.rows().filter((r) => this.filters.every(([op, k, v]) => (op === 'eq' ? r[k] === v : String(r[k]) < String(v))))
  }
  maybeSingle() {
    return Promise.resolve({ data: this.matched()[0] ?? null, error: null })
  }
  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    const m = this.matched()
    if (this.mode === 'delete') {
      const keep = this.rows().filter((r) => !m.includes(r))
      this.rows().splice(0, this.rows().length, ...keep)
      return Promise.resolve({ error: null }).then(resolve, reject)
    }
    return Promise.resolve({ data: this.head ? null : m, error: null, count: m.length }).then(resolve, reject)
  }
}

vi.mock('./_lib/server.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/server.js')>()
  return {
    ...real,
    serviceClient: () => ({ from: (t: 'wallet_nonces' | 'organizer_wallets') => new Q(t) }),
    requireUser: () => Promise.resolve({ id: state.user }),
    chainConfig: () => ({ chainId: 5042, contract: '0x00000000000000000000000000000000000fa15e' }),
    publicClientFor: () => ({ verifyMessage }),
  }
})

import handler from './wallet'

function call(step: string, body: Record<string, unknown>) {
  const out: { status?: number; body?: Record<string, unknown> } = {}
  const res = {
    writableEnded: false,
    setHeader: () => res,
    status(code: number) {
      out.status = code
      return res
    },
    json(b: Record<string, unknown>) {
      out.body = b
      res.writableEnded = true
      return res
    },
  }
  const req = { method: 'POST', query: { step }, headers: {}, body } as unknown as VercelRequest
  return handler(req, res as unknown as VercelResponse).then(() => out)
}

beforeEach(() => {
  state.nonces = []
  state.wallets = []
  state.user = 'user-1'
})

describe('wallet ownership by signed nonce', () => {
  it('links a wallet after a valid signature and burns the nonce', async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const challenge = await call('nonce', { address: account.address })
    const { message, nonce } = challenge.body as { message: string; nonce: string }
    const signature = await account.signMessage({ message })
    const out = await call('verify', { address: account.address, nonce, signature })
    expect(out.status).toBe(200)
    expect(state.wallets).toHaveLength(1)
    expect(state.nonces).toHaveLength(0)
    // replaying the same signature fails
    const replay = await call('verify', { address: account.address, nonce, signature })
    expect(replay.status).toBe(400)
  })

  it('rejects a signature from a different wallet than the one claimed', async () => {
    const owner = privateKeyToAccount(generatePrivateKey())
    const attacker = privateKeyToAccount(generatePrivateKey())
    const { message, nonce } = (await call('nonce', { address: owner.address })).body as { message: string; nonce: string }
    const signature = await attacker.signMessage({ message })
    const out = await call('verify', { address: owner.address, nonce, signature })
    expect(out.status).toBe(400)
    expect(state.wallets).toHaveLength(0)
  })

  it("cannot use another account's challenge", async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const { message, nonce } = (await call('nonce', { address: account.address })).body as { message: string; nonce: string }
    const signature = await account.signMessage({ message })
    state.user = 'user-2'
    const out = await call('verify', { address: account.address, nonce, signature })
    expect(out.status).toBe(400)
    expect(state.wallets).toHaveLength(0)
  })

  it('rejects an expired challenge and limits open challenges', async () => {
    const account = privateKeyToAccount(generatePrivateKey())
    const { message, nonce } = (await call('nonce', { address: account.address })).body as { message: string; nonce: string }
    state.nonces[0].expires_at = new Date(Date.now() - 1000).toISOString()
    const signature = await account.signMessage({ message })
    expect((await call('verify', { address: account.address, nonce, signature })).status).toBe(400)

    state.nonces = []
    for (let i = 0; i < 5; i++) expect((await call('nonce', { address: account.address })).status).toBe(200)
    expect((await call('nonce', { address: account.address })).status).toBe(429)
  })
})
