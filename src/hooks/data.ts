import { useQuery } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { checkManifestFile, eventIdToBytes32, type Manifest } from '@shared/manifest'
import { onchainEventId } from '@shared/draw'
import { requireSupabase } from '@/lib/supabase'
import { fetchOnchainEvent, isTerminalPhase, safeHttpsUrl, type OnchainEvent } from '@/lib/chain'
import { APP_CHAIN_ID, FAIRSLOT_ADDRESS } from '@/lib/env'

/** Supabase responses are untyped (no generated schema types); every query states its row type here. */
function typed<T>(value: unknown): T {
  return value as T
}

export type DeliveryStatus = 'pending' | 'contacted' | 'confirmed' | 'delivered' | 'declined' | 'no_response'

export interface DbEvent {
  id: string
  public_id: string
  organizer_id: string
  title: string
  description: string
  rules: string
  prizes: { rank: number; name: string }[]
  winner_count: number
  reserve_count: number
  draw_not_before: string
  status: 'draft' | 'locked' | 'committed'
  chain_id: number | null
  contract_address: string | null
  organizer_wallet: string | null
  manifest_hash: string | null
  manifest_path: string | null
  manifest_uri: string | null
  locked_at: string | null
  commit_tx_hash: string | null
  onchain_event_id: string | null
  committed_at: string | null
  created_at: string
}

export interface PublicEventRow {
  public_id: string
  title: string
  description: string
  rules: string
  prizes: { rank: number; name: string }[]
  winner_count: number
  reserve_count: number
  draw_not_before: string
  status: 'locked' | 'committed'
  chain_id: number | null
  contract_address: string | null
  organizer_wallet: string | null
  manifest_hash: string | null
  manifest_uri: string | null
  commit_tx_hash: string | null
  onchain_event_id: string | null
  locked_at: string | null
  committed_at: string | null
}

export interface DbEntry {
  id: string
  event_id: string
  public_entry_id: string
  external_id: string
  display_name: string
  email: string | null
}

export interface AuditRow {
  id: number
  action: string
  detail: Record<string, unknown>
  created_at: string
}

export interface FollowupRow {
  event_id: string
  entry_id: string
  rank: number
  status: DeliveryStatus
  contact_note: string
}

export function useMyEvents() {
  return useQuery({
    queryKey: ['my-events'],
    queryFn: async () => {
      const res = await requireSupabase().from('events').select('*').order('created_at', { ascending: false })
      if (res.error) throw new Error(res.error.message)
      return typed<DbEvent[]>(res.data)
    },
  })
}

export function useMyEvent(publicId: string | undefined) {
  return useQuery({
    queryKey: ['my-event', publicId],
    enabled: Boolean(publicId),
    queryFn: async () => {
      const res = await requireSupabase().from('events').select('*').eq('public_id', publicId ?? '').maybeSingle()
      if (res.error) throw new Error(res.error.message)
      return typed<DbEvent | null>(res.data)
    },
  })
}

export function usePublicEvent(publicId: string | undefined) {
  return useQuery({
    queryKey: ['public-event', publicId],
    enabled: Boolean(publicId),
    queryFn: async () => {
      const res = await requireSupabase().rpc('public_event', { p_public_id: publicId })
      if (res.error) throw new Error(res.error.message)
      return (typed<PublicEventRow[] | null>(res.data) ?? [])[0] ?? null
    },
  })
}

export function usePublicDelivery(publicId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['public-delivery', publicId],
    enabled: Boolean(publicId) && enabled,
    queryFn: async () => {
      const res = await requireSupabase().rpc('public_delivery', { p_public_id: publicId })
      if (res.error) throw new Error(res.error.message)
      return typed<{ public_entry_id: string; rank: number; status: DeliveryStatus; updated_at: string }[] | null>(res.data) ?? []
    },
  })
}

/** All entries of an event (paged, because the API caps rows per request). Organizer only. */
export function useEntries(eventId: string | undefined) {
  return useQuery({
    queryKey: ['entries', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const db = requireSupabase()
      const rows: DbEntry[] = []
      for (let from = 0; ; from += 1000) {
        const res = await db
          .from('entries')
          .select('*')
          .eq('event_id', eventId ?? '')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + 999)
        if (res.error) throw new Error(res.error.message)
        const page = typed<DbEntry[]>(res.data)
        rows.push(...page)
        if (page.length < 1000) break
      }
      return rows
    },
  })
}

export function useAudit(eventId: string | undefined) {
  return useQuery({
    queryKey: ['audit', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const res = await requireSupabase().from('audit_log').select('id, action, detail, created_at').eq('event_id', eventId ?? '').order('id', { ascending: false }).limit(100)
      if (res.error) throw new Error(res.error.message)
      return typed<AuditRow[]>(res.data)
    },
  })
}

export function useFollowups(eventId: string | undefined) {
  return useQuery({
    queryKey: ['followups', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const res = await requireSupabase().from('winner_followups').select('*').eq('event_id', eventId ?? '')
      if (res.error) throw new Error(res.error.message)
      return typed<FollowupRow[]>(res.data)
    },
  })
}

export function useWallets() {
  return useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const res = await requireSupabase().from('organizer_wallets').select('address, verified_at')
      if (res.error) throw new Error(res.error.message)
      return typed<{ address: Address; verified_at: string }[]>(res.data)
    },
  })
}

export type ManifestStatus =
  | { state: 'loading' }
  | { state: 'ok'; manifest: Manifest; hash: Hex }
  | { state: 'missing'; detail?: string }
  | { state: 'mismatch'; actualHash?: Hex }
  | { state: 'invalid'; detail?: string }

/** Downloads the manifest and checks it against the hash committed onchain. Never trusts a file that does not match. */
const MAX_MANIFEST_BYTES = 3 * 1024 * 1024

/** Reads a response body but gives up past the cap, so a hostile URI cannot make the page download gigabytes. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      throw new Error('file-too-large')
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(merged)
}

export function useManifest(uri: string | undefined, expectedHash: string | undefined) {
  return useQuery<ManifestStatus>({
    queryKey: ['manifest', uri, expectedHash],
    enabled: Boolean(uri && expectedHash),
    staleTime: Infinity,
    queryFn: async () => {
      const safe = safeHttpsUrl(uri)
      if (!safe) return { state: 'invalid', detail: 'unsafe-uri' }
      let text: string
      try {
        const res = await fetch(safe, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20_000) })
        if (!res.ok) return { state: 'missing', detail: String(res.status) }
        const tooLarge = Number(res.headers.get('content-length') ?? 0) > MAX_MANIFEST_BYTES
        if (tooLarge) return { state: 'invalid', detail: 'file-too-large' }
        text = await readCapped(res, MAX_MANIFEST_BYTES)
      } catch (error) {
        if (error instanceof Error && error.message === 'file-too-large') return { state: 'invalid', detail: 'file-too-large' }
        return { state: 'missing', detail: error instanceof Error ? error.message : undefined }
      }
      const verdict = checkManifestFile(text, expectedHash as Hex)
      if (verdict.ok) return { state: 'ok', manifest: verdict.manifest, hash: verdict.hash }
      if (verdict.reason === 'hash-mismatch') return { state: 'mismatch', actualHash: verdict.actualHash }
      return { state: 'invalid', detail: verdict.detail ?? verdict.reason }
    },
  })
}

/** The identifier used onchain for an event, derived from public values only. */
export function deriveOnchainEventId(publicId: string, organizerWallet: string | null | undefined): Hex | null {
  if (!FAIRSLOT_ADDRESS || !organizerWallet) return null
  return onchainEventId(BigInt(APP_CHAIN_ID), FAIRSLOT_ADDRESS, organizerWallet as Address, eventIdToBytes32(publicId))
}

export function useOnchainEvent(eventId: Hex | null) {
  return useQuery<OnchainEvent | null>({
    queryKey: ['onchain-event', eventId],
    enabled: Boolean(eventId),
    queryFn: () => fetchOnchainEvent(eventId as Hex),
    refetchInterval: (query) => {
      const data = query.state.data
      return data && isTerminalPhase(data.phase) ? false : 4000
    },
  })
}
