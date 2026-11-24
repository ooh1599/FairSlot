import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientIp, env, handler, HttpError, rateLimit, rpcUrlFor } from './_lib/server.js'
import { D20_COORDINATOR, isSupportedChain } from '../shared/chains.js'

/**
 * Read-only JSON-RPC relay served from the app's own origin. Public Arc RPC hosts (*.arc.io) are blocked by
 * common ad-block lists, so browsers read through here. Only read methods are forwarded; writes go through the wallet.
 */
const ALLOWED = new Set([
  'eth_chainId',
  'net_version',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_call',
  'eth_getLogs',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_getCode',
  'eth_getBalance',
  'eth_getStorageAt',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getTransactionCount',
])
const MAX_BATCH = 10
const MAX_LOG_RANGE = 10_000n
const MAX_REQUESTS_PER_MINUTE = 240
const HEX = /^0x[0-9a-f]+$/i
const ADDRESS = /^0x[0-9a-f]{40}$/i

/** eth_call targets the app actually reads: the FairSlot contract and the D20DAO coordinator on that chain. */
function allowedCallTargets(chainId: number): Set<string> {
  const targets = new Set<string>([D20_COORDINATOR[chainId].toLowerCase()])
  const fairSlot = env('VITE_FAIRSLOT_ADDRESS')
  if (fairSlot && Number(env('VITE_CHAIN_ID') ?? 5042) === chainId) targets.add(fairSlot.toLowerCase())
  return targets
}

interface RpcCall {
  jsonrpc: '2.0'
  id: number | string | null
  method: string
  params?: unknown[]
}

function check(call: RpcCall, chainId: number) {
  if (!call || typeof call.method !== 'string' || !ALLOWED.has(call.method)) {
    throw new HttpError(403, 'method-not-allowed', `RPC method not allowed: ${String(call?.method)}`)
  }
  if (call.method === 'eth_getLogs') {
    // Explicit numeric ranges only: tags such as "earliest" would let anyone scan the whole chain through this relay.
    const f = (call.params?.[0] ?? {}) as { fromBlock?: string; toBlock?: string; blockHash?: string; address?: unknown }
    if (!f.blockHash) {
      if (!f.fromBlock || !f.toBlock || !HEX.test(f.fromBlock) || !HEX.test(f.toBlock)) throw new HttpError(400, 'log-range-required')
      const span = BigInt(f.toBlock) - BigInt(f.fromBlock)
      if (span < 0n || span > MAX_LOG_RANGE) throw new HttpError(400, 'log-range-too-large')
    }
    const addresses = Array.isArray(f.address) ? f.address : [f.address]
    const targets = allowedCallTargets(chainId)
    if (!addresses.every((a) => typeof a === 'string' && targets.has(a.toLowerCase()))) throw new HttpError(403, 'address-not-allowed')
  }
  if (call.method === 'eth_call' || call.method === 'eth_estimateGas') {
    const tx = (call.params?.[0] ?? {}) as { to?: unknown }
    if (call.method === 'eth_call' && !(typeof tx.to === 'string' && ADDRESS.test(tx.to) && allowedCallTargets(chainId).has(tx.to.toLowerCase()))) {
      throw new HttpError(403, 'address-not-allowed')
    }
  }
}

export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  const chainId = Number(req.query.chain)
  if (!isSupportedChain(chainId)) throw new HttpError(400, 'unsupported-chain')
  rateLimit(`rpc:${clientIp(req)}`, MAX_REQUESTS_PER_MINUTE, 60_000)
  const payload = req.body as RpcCall | RpcCall[]
  const calls = Array.isArray(payload) ? payload : [payload]
  if (calls.length === 0 || calls.length > MAX_BATCH) throw new HttpError(400, 'invalid-batch')
  calls.forEach((c) => check(c, chainId))

  const upstream = await fetch(rpcUrlFor(chainId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await upstream.text()
  res.status(upstream.status).setHeader('content-type', 'application/json').send(text)
})
