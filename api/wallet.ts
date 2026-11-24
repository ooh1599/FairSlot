import { randomBytes } from 'node:crypto'
import { isAddress, type Address, type Hex } from 'viem'
import { body, chainConfig, env, handler, HttpError, publicClientFor, requireUser, serviceClient } from './_lib/server.js'
import { ARC_MAINNET_CHAIN_ID } from '../shared/limits.js'

/**
 * Wallet ownership by signed nonce.
 *   POST /api/wallet?step=nonce   { address }                      -> { message, nonce }
 *   POST /api/wallet?step=verify  { address, nonce, signature }    -> { ok: true }
 */
const NONCE_TTL_MS = 10 * 60 * 1000
const MAX_OPEN_NONCES = 5

function messageFor(userId: string, address: string, nonce: string, issuedAt: Date): string {
  return [
    'FairSlot wallet verification',
    'Sign this message to link your wallet to your FairSlot account. It does not cost gas.',
    `Account: ${userId}`,
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt.toISOString()}`,
  ].join('\n')
}

export default handler(['POST'], async (req) => {
  const db = serviceClient()
  const user = await requireUser(req, db)
  const step = String(req.query.step ?? '')
  const input = body<{ address?: string; nonce?: string; signature?: string }>(req)
  if (!input.address || !isAddress(input.address)) throw new HttpError(400, 'invalid-address')
  const address = input.address.toLowerCase() as Address

  if (step === 'nonce') {
    // Housekeeping and abuse limit: drop expired nonces, allow only a few open challenges per account.
    await db.from('wallet_nonces').delete().lt('expires_at', new Date().toISOString())
    const open = await db.from('wallet_nonces').select('nonce', { count: 'exact', head: true }).eq('user_id', user.id)
    if ((open.count ?? 0) >= MAX_OPEN_NONCES) throw new HttpError(429, 'too-many-challenges')
    const nonce = randomBytes(16).toString('hex')
    const issuedAt = new Date()
    const { error } = await db.from('wallet_nonces').insert({
      nonce,
      user_id: user.id,
      address,
      expires_at: new Date(issuedAt.getTime() + NONCE_TTL_MS).toISOString(),
    })
    if (error) throw new HttpError(500, 'nonce-store-failed')
    return { nonce, message: messageFor(user.id, address, nonce, issuedAt) }
  }

  if (step === 'verify') {
    if (!input.nonce || !input.signature || !/^0x[0-9a-fA-F]+$/.test(input.signature)) throw new HttpError(400, 'invalid-body')
    const { data: row } = await db.from('wallet_nonces').select('*').eq('nonce', input.nonce).maybeSingle()
    if (!row || row.user_id !== user.id || row.address !== address) throw new HttpError(400, 'unknown-nonce')
    const expiresAt = new Date(row.expires_at as string)
    // single use: remove first so a replayed signature cannot be accepted twice
    await db.from('wallet_nonces').delete().eq('nonce', input.nonce)
    if (expiresAt.getTime() < Date.now()) throw new HttpError(400, 'nonce-expired')

    const message = messageFor(user.id, address, input.nonce, new Date(expiresAt.getTime() - NONCE_TTL_MS))
    // Uses the chain client so contract wallets (ERC-1271 / ERC-6492) verify as well as plain EOAs.
    let chainId = ARC_MAINNET_CHAIN_ID
    try {
      chainId = chainConfig().chainId
    } catch {
      chainId = Number(env('VITE_CHAIN_ID') ?? ARC_MAINNET_CHAIN_ID)
    }
    const valid = await publicClientFor(chainId).verifyMessage({ address, message, signature: input.signature as Hex })
    if (!valid) throw new HttpError(400, 'bad-signature')

    const { error } = await db.from('organizer_wallets').upsert({ user_id: user.id, address, verified_at: new Date().toISOString() })
    if (error) throw new HttpError(500, 'wallet-store-failed')
    return { ok: true, address }
  }

  throw new HttpError(400, 'unknown-step')
})
