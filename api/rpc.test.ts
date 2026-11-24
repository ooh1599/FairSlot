import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from './rpc'

function run(req: Partial<VercelRequest>) {
  const out: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} }
  const res = {
    writableEnded: false,
    setHeader(k: string, v: string) {
      out.headers[k] = v
      return res
    },
    status(code: number) {
      out.status = code
      return res
    },
    json(body: unknown) {
      out.body = body
      res.writableEnded = true
      return res
    },
    send(body: unknown) {
      out.body = body
      res.writableEnded = true
      return res
    },
  }
  return handler(req as VercelRequest, res as unknown as VercelResponse).then(() => out)
}

afterEach(() => vi.unstubAllGlobals())

describe('read-only RPC relay', () => {
  it('rejects write methods', async () => {
    const out = await run({ method: 'POST', query: { chain: '5042' }, body: { jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: ['0x00'] } })
    expect(out.status).toBe(403)
  })

  it('rejects unsupported chains and oversized batches', async () => {
    expect((await run({ method: 'POST', query: { chain: '1' }, body: { jsonrpc: '2.0', id: 1, method: 'eth_chainId' } })).status).toBe(400)
    const batch = Array.from({ length: 11 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_chainId' }))
    expect((await run({ method: 'POST', query: { chain: '5042' }, body: batch })).status).toBe(400)
  })

  it('rejects huge log ranges', async () => {
    const out = await run({
      method: 'POST',
      query: { chain: '5042' },
      body: { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: '0x0', toBlock: '0xfffff' }] },
    })
    expect(out.status).toBe(400)
  })

  it('requires explicit numeric log ranges and known addresses', async () => {
    const coordinator = '0xd20da057469C45928912d983F45790C41e290571'
    const noRange = await run({ method: 'POST', query: { chain: '5042' }, body: { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ address: coordinator, fromBlock: 'earliest', toBlock: 'latest' }] } })
    expect(noRange.status).toBe(400)
    const foreign = await run({ method: 'POST', query: { chain: '5042' }, body: { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ address: '0x3600000000000000000000000000000000000000', fromBlock: '0x10', toBlock: '0x20' }] } })
    expect(foreign.status).toBe(403)
  })

  it('only forwards eth_call to the coordinator or the FairSlot contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"jsonrpc":"2.0","id":1,"result":"0x"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const foreign = await run({ method: 'POST', query: { chain: '5042' }, body: { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: '0x3600000000000000000000000000000000000000', data: '0x' }, 'latest'] } })
    expect(foreign.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    const ok = await run({ method: 'POST', query: { chain: '5042' }, body: { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: '0xd20da057469C45928912d983F45790C41e290571', data: '0x' }, 'latest'] } })
    expect(ok.status).toBe(200)
  })

  it('forwards an allowed read call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"jsonrpc":"2.0","id":1,"result":"0x13b2"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await run({ method: 'POST', query: { chain: '5042' }, body: { jsonrpc: '2.0', id: 1, method: 'eth_chainId' } })
    expect(out.status).toBe(200)
    expect(out.body).toContain('0x13b2')
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('arc.io')
  })

  it('only accepts POST', async () => {
    expect((await run({ method: 'GET', query: { chain: '5042' } })).status).toBe(405)
  })
})
