import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createPublicClient, http, isAddress, type Address, type PublicClient } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from '../../shared/limits.js'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

export function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

export function serviceClient(): SupabaseClient {
  const url = env('VITE_SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new HttpError(503, 'backend-not-configured', 'Supabase environment variables are missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function chainConfig(): { chainId: number; contract: Address } {
  const chainId = Number(env('VITE_CHAIN_ID') ?? ARC_MAINNET_CHAIN_ID)
  const contract = env('VITE_FAIRSLOT_ADDRESS')
  if (chainId !== ARC_MAINNET_CHAIN_ID && chainId !== ARC_TESTNET_CHAIN_ID) {
    throw new HttpError(503, 'unsupported-chain', `Unsupported VITE_CHAIN_ID ${chainId}`)
  }
  if (!contract || !isAddress(contract)) {
    throw new HttpError(503, 'contract-not-configured', 'VITE_FAIRSLOT_ADDRESS is not set to a deployed FairSlot contract')
  }
  return { chainId, contract: contract.toLowerCase() as Address }
}

export function rpcUrlFor(chainId: number): string {
  const override = chainId === ARC_MAINNET_CHAIN_ID ? env('ARC_MAINNET_RPC_URL') : env('ARC_TESTNET_RPC_URL')
  if (override) return override
  const chain = chainId === ARC_MAINNET_CHAIN_ID ? arc : arcTestnet
  return chain.rpcUrls.default.http[0]
}

export function publicClientFor(chainId: number): PublicClient {
  const chain = chainId === ARC_MAINNET_CHAIN_ID ? arc : arcTestnet
  return createPublicClient({ chain, transport: http(rpcUrlFor(chainId), { timeout: 15_000, retryCount: 2 }) }) as PublicClient
}

export async function requireUser(req: VercelRequest, db: SupabaseClient): Promise<{ id: string }> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  // Throttle before the identity lookup so a flood of bad tokens cannot turn into a flood of auth calls.
  rateLimit(`api-ip:${clientIp(req)}`, 120, 60_000)
  if (!token) throw new HttpError(401, 'unauthorized')
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'unauthorized')
  rateLimit(`api-user:${data.user.id}`, 60, 60_000)
  return { id: data.user.id }
}

export function handler(
  methods: string[],
  fn: (req: VercelRequest, res: VercelResponse) => Promise<unknown>,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!req.method || !methods.includes(req.method)) {
      res.status(405).json({ error: 'method-not-allowed' })
      return
    }
    try {
      const out = await fn(req, res)
      if (!res.writableEnded) res.status(200).json(out ?? { ok: true })
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.code, message: error.message })
      } else {
        console.error(error)
        res.status(500).json({ error: 'internal-error' })
      }
    }
  }
}

export function body<T>(req: VercelRequest): T {
  const raw = req.body as unknown
  if (raw && typeof raw === 'object') return raw as T
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T
    } catch {
      /* fall through */
    }
  }
  throw new HttpError(400, 'invalid-body')
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Best-effort per-instance rate limit (fixed window). Serverless instances do not share memory, so this only blunts
 * accidental floods; put Vercel Firewall rate limiting in front for real protection (see docs/security.md).
 */
const windows = new Map<string, { start: number; count: number }>()
export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now()
  const w = windows.get(key)
  if (!w || now - w.start > windowMs) {
    if (windows.size >= 5000) {
      // Drop expired windows. If the map is still full of live ones, do not evict them (that would let a flood of fresh
      // keys reset other callers' counters): let this new key through untracked. Real protection is the platform firewall.
      for (const [k, v] of windows) if (now - v.start > windowMs) windows.delete(k)
      if (windows.size >= 5000) return
    }
    windows.set(key, { start: now, count: 1 })
    return
  }
  w.count += 1
  if (w.count > max) throw new HttpError(429, 'rate-limited')
}

/** Vercel sets these itself and overwrites any value a client sends, so they are preferred over a raw X-Forwarded-For. */
export function clientIp(req: VercelRequest): string {
  const pick = (name: string): string | undefined => {
    const value = req.headers?.[name]
    const first = Array.isArray(value) ? value[0] : value?.split(',')[0]
    return first?.trim() || undefined
  }
  return pick('x-vercel-forwarded-for') ?? pick('x-real-ip') ?? pick('x-forwarded-for') ?? 'unknown'
}
