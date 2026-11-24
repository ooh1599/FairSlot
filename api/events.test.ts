import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, keccak256, parseAbiParameters, toBytes, type Hex } from 'viem'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fairSlotAbi } from '../shared/fairslotAbi'
import { onchainEventId } from '../shared/draw'
import { eventIdToBytes32 } from '../shared/manifest'
import { generatePublicEntryId, generatePublicEventId } from '../shared/ids'

const CONTRACT = '0x00000000000000000000000000000000000fa15e'
const WALLET = '0x00000000000000000000000000000000000abc01'
const OTHER_WALLET = '0x00000000000000000000000000000000000abc02'

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  files: new Map<string, string>(),
  receipt: null as unknown,
}))

class Query {
  private filters: [string, unknown][] = []
  private op: 'select' | 'update' = 'select'
  private payload: Row = {}
  private head = false
  private orderKey: string | null = null
  private window: [number, number] | null = null
  constructor(private rows: Row[]) {}
  select(_cols?: string, opts?: { head?: boolean }) {
    this.op = 'select'
    this.head = Boolean(opts?.head)
    return this
  }
  update(payload: Row) {
    this.op = 'update'
    this.payload = payload
    return this
  }
  eq(key: string, value: unknown) {
    this.filters.push([key, value])
    return this
  }
  order(key: string) {
    this.orderKey = key
    return this
  }
  range(from: number, to: number) {
    this.window = [from, to]
    return this
  }
  private run() {
    const matched = this.rows.filter((r) => this.filters.every(([k, v]) => r[k] === v))
    if (this.op === 'update') {
      matched.forEach((r) => Object.assign(r, this.payload))
      return { data: null, error: null }
    }
    if (this.head) return { data: null, error: null, count: matched.length }
    let out = [...matched]
    if (this.orderKey) out.sort((a, b) => String(a[this.orderKey as string]).localeCompare(String(b[this.orderKey as string])))
    if (this.window) out = out.slice(this.window[0], this.window[1] + 1)
    return { data: out, error: null, count: matched.length }
  }
  maybeSingle() {
    const r = this.run()
    return Promise.resolve({ data: r.data?.[0] ?? null, error: null })
  }
  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    return Promise.resolve(this.run()).then(resolve, reject)
  }
}

const fakeDb = {
  from: (table: string) => new Query((state.tables[table] ??= [])),
  storage: {
    from: () => ({
      upload: (path: string, blob: Blob) => {
        if (state.files.has(path)) return Promise.resolve({ error: { message: 'The resource already exists' } })
        return blob.text().then((t) => {
          state.files.set(path, t)
          return { error: null }
        })
      },
      download: (path: string) => Promise.resolve({ data: state.files.has(path) ? new Blob([state.files.get(path) as string]) : null }),
    }),
  },
}

vi.mock('./_lib/server.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/server.js')>()
  return {
    ...real,
    serviceClient: () => fakeDb,
    requireUser: () => Promise.resolve({ id: 'user-1' }),
    chainConfig: () => ({ chainId: 5042, contract: CONTRACT }),
    publicClientFor: () => ({ getTransactionReceipt: () => Promise.resolve(state.receipt) }),
    env: (name: string) => (name === 'VITE_SUPABASE_URL' ? 'https://example.supabase.co' : real.env(name)),
  }
})

import handler from './events'

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
  const req = { method: 'POST', query: { step }, headers: { authorization: 'Bearer test' }, body } as unknown as VercelRequest
  return handler(req, res as unknown as VercelResponse).then(() => out)
}

const EVENT_UUID = '11111111-1111-4111-8111-111111111111'
let publicId: string

function seed(entryCount: number, overrides: Row = {}) {
  publicId = generatePublicEventId()
  state.tables = {
    events: [
      {
        id: EVENT_UUID,
        public_id: publicId,
        organizer_id: 'user-1',
        title: 'Test giveaway',
        description: '',
        rules: '',
        prizes: [{ rank: 1, name: 'Gift' }],
        winner_count: 1,
        reserve_count: 1,
        draw_not_before: '2026-12-01T03:00:00+00:00',
        status: 'draft',
        chain_id: null,
        contract_address: null,
        organizer_wallet: null,
        manifest_hash: null,
        manifest_uri: null,
        ...overrides,
      },
    ],
    entries: Array.from({ length: entryCount }, () => ({ event_id: EVENT_UUID, public_entry_id: generatePublicEntryId() })),
    organizer_wallets: [{ user_id: 'user-1', address: WALLET }],
  }
  state.files = new Map()
  state.receipt = null
}

const eventRow = () => (state.tables.events as Row[])[0]

function commitReceipt(overrides: Partial<Record<string, unknown>> = {}) {
  const row = eventRow()
  const eventId = onchainEventId(5042n, CONTRACT, WALLET, keccak256(toBytes(publicId)))
  const args = {
    eventId,
    organizer: WALLET,
    publicEventId: eventIdToBytes32(publicId),
    manifestHash: row.manifest_hash as Hex,
    manifestURI: row.manifest_uri as string,
    participantCount: (state.tables.entries as Row[]).length,
    winnerCount: 1,
    reserveCount: 1,
    algorithmVersion: 1,
    drawNotBefore: BigInt(Math.floor(Date.parse(row.draw_not_before as string) / 1000)),
    refundRecipient: WALLET,
    committedAt: 1n,
    ...overrides,
  }
  const topics = encodeEventTopics({
    abi: fairSlotAbi,
    eventName: 'EventCommitted',
    args: { eventId: args.eventId as Hex, organizer: args.organizer as Hex, publicEventId: args.publicEventId },
  })
  const data = encodeAbiParameters(
    parseAbiParameters('bytes32, string, uint16, uint8, uint8, uint8, uint64, address, uint64'),
    [args.manifestHash, args.manifestURI, args.participantCount as number, args.winnerCount as number, args.reserveCount as number, args.algorithmVersion as number, args.drawNotBefore as bigint, args.refundRecipient as Hex, args.committedAt as bigint],
  )
  return { status: 'success', logs: [{ address: CONTRACT, topics, data }] }
}

beforeEach(() => seed(5))

describe('publish step', () => {
  it('refuses to lock when there are not enough participants, and leaves the draft untouched', async () => {
    seed(1)
    const out = await call('publish', { eventId: EVENT_UUID, wallet: WALLET })
    expect(out.status).toBe(400)
    expect(out.body?.error).toBe('not-enough-entries')
    expect(eventRow().status).toBe('draft')
  })

  it('requires a wallet the user proved they own', async () => {
    const out = await call('publish', { eventId: EVENT_UUID, wallet: OTHER_WALLET })
    expect(out.status).toBe(403)
    expect(eventRow().status).toBe('draft')
  })

  it('locks, stores a content-addressed manifest and is idempotent', async () => {
    const first = await call('publish', { eventId: EVENT_UUID, wallet: WALLET })
    expect(first.status).toBe(200)
    expect(eventRow().status).toBe('locked')
    const hash = first.body?.manifestHash as string
    expect([...state.files.keys()]).toEqual([`${publicId}/${hash}.json`])
    expect(first.body?.participantCount).toBe(5)

    const second = await call('publish', { eventId: EVENT_UUID, wallet: WALLET })
    expect(second.status).toBe(200)
    expect(second.body?.manifestHash).toBe(hash)
    expect(state.files.size).toBe(1)
  })

  it('refuses a different wallet after locking', async () => {
    ;(state.tables.organizer_wallets as Row[]).push({ user_id: 'user-1', address: OTHER_WALLET })
    await call('publish', { eventId: EVENT_UUID, wallet: WALLET })
    const out = await call('publish', { eventId: EVENT_UUID, wallet: OTHER_WALLET })
    expect(out.status).toBe(409)
  })

  it('does not republish a locked event under a different contract', async () => {
    await call('publish', { eventId: EVENT_UUID, wallet: WALLET })
    eventRow().contract_address = '0x00000000000000000000000000000000000dead0'
    const out = await call('publish', { eventId: EVENT_UUID, wallet: WALLET })
    expect(out.status).toBe(409)
    expect(out.body?.error).toBe('contract-changed')
  })
})

describe('confirm step', () => {
  async function locked() {
    await call('publish', { eventId: EVENT_UUID, wallet: WALLET })
  }

  it('accepts a commit transaction that matches the locked event exactly', async () => {
    await locked()
    state.receipt = commitReceipt()
    const out = await call('confirm', { eventId: EVENT_UUID, txHash: `0x${'ab'.repeat(32)}` })
    expect(out.status).toBe(200)
    expect(eventRow().status).toBe('committed')
  })

  it('rejects a commitment whose participant count differs from the published list', async () => {
    await locked()
    state.receipt = commitReceipt({ participantCount: 9999 })
    const out = await call('confirm', { eventId: EVENT_UUID, txHash: `0x${'ab'.repeat(32)}` })
    expect(out.status).toBe(400)
    expect(eventRow().status).toBe('locked')
  })

  it('rejects a commitment with a different manifest hash or another organizer', async () => {
    await locked()
    state.receipt = commitReceipt({ manifestHash: `0x${'22'.repeat(32)}` })
    expect((await call('confirm', { eventId: EVENT_UUID, txHash: `0x${'ab'.repeat(32)}` })).status).toBe(400)
    state.receipt = commitReceipt({ organizer: OTHER_WALLET })
    expect((await call('confirm', { eventId: EVENT_UUID, txHash: `0x${'ab'.repeat(32)}` })).status).toBe(400)
    expect(eventRow().status).toBe('locked')
  })

  it('rejects reverted transactions and events that are not locked yet', async () => {
    state.receipt = { status: 'reverted', logs: [] }
    expect((await call('confirm', { eventId: EVENT_UUID, txHash: `0x${'ab'.repeat(32)}` })).status).toBe(409)
    await locked()
    expect((await call('confirm', { eventId: EVENT_UUID, txHash: `0x${'ab'.repeat(32)}` })).status).toBe(400)
  })

  it('does not let another user touch the event', async () => {
    eventRow().organizer_id = 'someone-else'
    const out = await call('publish', { eventId: EVENT_UUID, wallet: WALLET })
    expect(out.status).toBe(404)
  })
})
