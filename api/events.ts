import { decodeEventLog, isAddress, keccak256, toBytes, type Address, type Hex } from 'viem'
import { body, chainConfig, env, handler, HttpError, publicClientFor, requireUser, serviceClient, UUID } from './_lib/server.js'
import { fairSlotAbi } from '../shared/fairslotAbi.js'
import { buildManifest, canonicalManifest, checkManifestFile, eventIdToBytes32, manifestHash, manifestObjectPath } from '../shared/manifest.js'
import { onchainEventId } from '../shared/draw.js'
import { ALGORITHM_VERSION } from '../shared/limits.js'

/**
 *   POST /api/events?step=publish  { eventId, wallet }   lock the list, build + store the manifest
 *   POST /api/events?step=confirm  { eventId, txHash }   verify the commit transaction on chain
 */
const BUCKET = 'manifests'

function toIsoSeconds(value: string): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function countEntries(db: ReturnType<typeof serviceClient>, eventId: string): Promise<number> {
  const { count, error } = await db.from('entries').select('id', { count: 'exact', head: true }).eq('event_id', eventId)
  if (error) throw new HttpError(500, 'entries-read-failed')
  return count ?? 0
}

export default handler(['POST'], async (req) => {
  const db = serviceClient()
  const user = await requireUser(req, db)
  const step = String(req.query.step ?? '')
  const input = body<{ eventId?: string; wallet?: string; txHash?: string }>(req)
  if (!input.eventId || !UUID.test(input.eventId)) throw new HttpError(400, 'invalid-event')

  const { data: event } = await db.from('events').select('*').eq('id', input.eventId).eq('organizer_id', user.id).maybeSingle()
  if (!event) throw new HttpError(404, 'event-not-found')
  const { chainId, contract } = chainConfig()

  if (step === 'publish') {
    if (!input.wallet || !isAddress(input.wallet)) throw new HttpError(400, 'invalid-wallet')
    const wallet = input.wallet.toLowerCase() as Address
    if (event.status === 'committed') throw new HttpError(409, 'already-committed')
    if (event.organizer_wallet && event.organizer_wallet !== wallet) throw new HttpError(409, 'wallet-changed')
    const { data: linked } = await db.from('organizer_wallets').select('address').eq('user_id', user.id).eq('address', wallet).maybeSingle()
    if (!linked) throw new HttpError(403, 'wallet-not-verified')

    // A locked event is pinned to the chain and contract it was locked for; a changed deployment never rewrites it.
    if (event.status === 'locked' && ((event.contract_address && event.contract_address !== contract) || (event.chain_id && event.chain_id !== chainId))) {
      throw new HttpError(409, 'contract-changed')
    }

    const prizes = (event.prizes ?? []) as { rank: number; name: string }[]
    if (prizes.length !== event.winner_count) throw new HttpError(400, 'prizes-mismatch')
    // Validate everything that can fail BEFORE freezing, so a rejected request never leaves an unusable locked event.
    if ((await countEntries(db, event.id)) < event.winner_count + event.reserve_count) throw new HttpError(400, 'not-enough-entries')

    // 1. Freeze the list first: from here no entry can be added, removed or edited (database trigger).
    if (event.status === 'draft') {
      const { error } = await db
        .from('events')
        .update({ status: 'locked', locked_at: new Date().toISOString(), chain_id: chainId, contract_address: contract, organizer_wallet: wallet })
        .eq('id', event.id)
        .eq('status', 'draft')
      if (error) throw new HttpError(409, 'lock-failed')
    }

    // 2. Build the canonical manifest from the frozen list (paged: Supabase caps rows per request).
    const ids: string[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('entries').select('public_entry_id').eq('event_id', event.id).order('public_entry_id').range(from, from + 999)
      if (error) throw new HttpError(500, 'entries-read-failed')
      ids.push(...(data ?? []).map((r) => r.public_entry_id as string))
      if (!data || data.length < 1000) break
    }
    if (ids.length < event.winner_count + event.reserve_count) throw new HttpError(400, 'not-enough-entries')

    const manifest = buildManifest({
      eventPublicId: event.public_id,
      title: event.title,
      description: event.description,
      rules: event.rules,
      organizerWallet: wallet,
      chainId,
      contractAddress: contract,
      drawNotBeforeUtc: toIsoSeconds(event.draw_not_before),
      winnerCount: event.winner_count,
      reserveCount: event.reserve_count,
      prizes,
      entryIds: ids,
    })
    const hash = manifestHash(manifest)
    const text = canonicalManifest(manifest)
    const path = manifestObjectPath(manifest, hash)

    // 3. Content-addressed upload. upsert:false means an existing object is never overwritten.
    const up = await db.storage.from(BUCKET).upload(path, new Blob([text], { type: 'application/json' }), {
      upsert: false,
      contentType: 'application/json',
      cacheControl: '31536000',
    })
    if (up.error && !/exists|Duplicate/i.test(up.error.message)) throw new HttpError(502, 'manifest-upload-failed')
    if (up.error) {
      const existing = await db.storage.from(BUCKET).download(path)
      const verdict = existing.data ? checkManifestFile(await existing.data.text(), hash) : { ok: false as const }
      if (!verdict.ok) throw new HttpError(500, 'manifest-conflict', 'An object with this name exists but does not match its hash')
    }

    const url = `${env('VITE_SUPABASE_URL')}/storage/v1/object/public/${BUCKET}/${path}`
    const { error: saveError } = await db
      .from('events')
      .update({ manifest_hash: hash, manifest_path: path, manifest_uri: url })
      .eq('id', event.id)
    if (saveError) throw new HttpError(500, 'manifest-save-failed')

    return {
      manifestHash: hash,
      manifestUri: url,
      publicEventIdBytes32: eventIdToBytes32(event.public_id),
      drawNotBefore: Math.floor(Date.parse(manifest.drawNotBeforeUtc) / 1000),
      participantCount: manifest.participantCount,
      winnerCount: manifest.winnerCount,
      reserveCount: manifest.reserveCount,
      algorithmVersion: manifest.algorithmVersion,
      organizerWallet: wallet,
      chainId,
      contract,
    }
  }

  if (step === 'confirm') {
    if (!input.txHash || !/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) throw new HttpError(400, 'invalid-tx')
    if (event.status === 'committed') return { ok: true, status: 'committed' }
    if (event.status !== 'locked' || !event.manifest_hash || !event.organizer_wallet) throw new HttpError(409, 'not-locked')

    const client = publicClientFor(chainId)
    const receipt = await client.getTransactionReceipt({ hash: input.txHash as Hex }).catch(() => null)
    if (!receipt) throw new HttpError(404, 'receipt-not-found')
    if (receipt.status !== 'success') throw new HttpError(400, 'tx-reverted')

    // The on-chain participant count must equal the number of people in the locked list.
    const participants = await countEntries(db, event.id)
    let matched: Hex | null = null
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== contract) continue
      try {
        const decoded = decodeEventLog({ abi: fairSlotAbi, data: log.data, topics: log.topics })
        if (decoded.eventName !== 'EventCommitted') continue
        const a = decoded.args
        const expectedId = onchainEventId(BigInt(chainId), contract, event.organizer_wallet as Address, keccak256(toBytes(event.public_id)))
        if (
          a.organizer.toLowerCase() === event.organizer_wallet &&
          a.publicEventId === eventIdToBytes32(event.public_id) &&
          a.manifestHash.toLowerCase() === event.manifest_hash.toLowerCase() &&
          a.manifestURI === event.manifest_uri &&
          a.refundRecipient.toLowerCase() === event.organizer_wallet &&
          a.participantCount === participants &&
          a.algorithmVersion === ALGORITHM_VERSION &&
          a.winnerCount === event.winner_count &&
          a.reserveCount === event.reserve_count &&
          Number(a.drawNotBefore) === Math.floor(Date.parse(event.draw_not_before) / 1000) &&
          a.eventId === expectedId
        ) {
          matched = a.eventId
        }
      } catch {
        /* not a FairSlot log */
      }
    }
    if (!matched) throw new HttpError(400, 'commit-mismatch', 'The transaction does not contain the expected commitment')

    const { error } = await db
      .from('events')
      .update({ status: 'committed', commit_tx_hash: input.txHash.toLowerCase(), onchain_event_id: matched, committed_at: new Date().toISOString() })
      .eq('id', event.id)
      .eq('status', 'locked')
    if (error) throw new HttpError(500, 'commit-save-failed')
    return { ok: true, status: 'committed', onchainEventId: matched }
  }

  throw new HttpError(400, 'unknown-step')
})
