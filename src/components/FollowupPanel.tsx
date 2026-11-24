import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { toCsv } from '@shared/csv'
import { useI18n, type MessageKey } from '@/i18n'
import { useEntries, useFollowups, type DbEvent, type DeliveryStatus } from '@/hooks/data'
import { requireSupabase } from '@/lib/supabase'
import type { OnchainEvent } from '@/lib/chain'
import { Alert, Badge, Mono, Spinner } from './ui'
import { download } from './EntriesStep'

const STATUSES: { value: DeliveryStatus; key: MessageKey }[] = [
  { value: 'pending', key: 'followup.pending' },
  { value: 'contacted', key: 'followup.contacted' },
  { value: 'confirmed', key: 'followup.confirmed' },
  { value: 'delivered', key: 'followup.delivered' },
  { value: 'declined', key: 'followup.declined' },
  { value: 'no_response', key: 'followup.noResponse' },
]

/** Organizer's private follow-up list: contact, claim confirmation and delivery of the prize (outside this system). */
export function FollowupPanel({ event, chain }: { event: DbEvent; chain: OnchainEvent }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const entries = useEntries(event.id)
  const followups = useFollowups(event.id)
  const syncing = useRef(false)
  const syncFailed = useRef(false)
  const [notes, setNotes] = useState<Record<string, string>>({})

  // Manifest order = entries sorted by public entry id; chain winners are indices into that list.
  const ordered = useMemo(() => [...(entries.data ?? [])].sort((a, b) => (a.public_entry_id < b.public_entry_id ? -1 : 1)), [entries.data])
  const rows = useMemo(
    () =>
      chain.winners.map((index, i) => {
        const entry = ordered[index]
        const follow = followups.data?.find((f) => entry && f.entry_id === entry.id)
        return { rank: i + 1, isReserve: i >= chain.winnerCount, entry, follow, prize: event.prizes[i]?.name }
      }),
    [chain.winners, chain.winnerCount, ordered, followups.data, event.prizes],
  )

  const missing = rows.filter((r) => r.entry && !r.follow)
  useEffect(() => {
    if (missing.length === 0 || syncing.current || syncFailed.current) return
    syncing.current = true
    const run = async () => {
      try {
        const res = await requireSupabase()
          .from('winner_followups')
          .upsert(missing.map((r) => ({ event_id: event.id, entry_id: r.entry.id, rank: r.rank })), { onConflict: 'event_id,entry_id', ignoreDuplicates: true })
        // Do not retry in a loop when the database refuses; the organizer sees the message once.
        if (res.error) {
          syncFailed.current = true
          toast.error(t('entries.saveFailed'))
        }
        await queryClient.invalidateQueries({ queryKey: ['followups', event.id] })
      } catch {
        syncFailed.current = true
        toast.error(t('entries.saveFailed'))
      } finally {
        syncing.current = false
      }
    }
    void run()
  }, [missing, event.id, queryClient, t])

  const update = async (entryId: string, patch: { status?: DeliveryStatus; contact_note?: string }) => {
    const res = await requireSupabase().from('winner_followups').update(patch).eq('event_id', event.id).eq('entry_id', entryId)
    if (res.error) toast.error(t('entries.saveFailed'))
    await queryClient.invalidateQueries({ queryKey: ['followups', event.id] })
  }

  const exportWinners = () => {
    download(
      `${event.public_id}-winners.csv`,
      toCsv([
        ['rank', 'type', 'public_entry_id', 'external_id', 'display_name', 'email', 'prize', 'status'],
        ...rows.map((r) => [String(r.rank), r.isReserve ? 'reserve' : 'winner', r.entry?.public_entry_id ?? '', r.entry?.external_id ?? '', r.entry?.display_name ?? '', r.entry?.email ?? '', r.prize ?? '', r.follow?.status ?? 'pending']),
      ]),
    )
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-teal-600" aria-hidden />
          <h2 className="text-xl font-semibold">{t('followup.title')}</h2>
        </div>
        <button type="button" className="btn-ghost" onClick={exportWinners}>
          <Download className="h-4 w-4" aria-hidden />
          {t('followup.export')}
        </button>
      </div>
      <Alert tone="info">{t('followup.note')}</Alert>
      {(entries.isLoading || followups.isLoading) && <Spinner label={t('common.loading')} />}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.rank} className="rounded-xl border border-navy-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.isReserve ? 'neutral' : 'gold'}>{r.isReserve ? t('results.reserveN', { n: r.rank - chain.winnerCount }) : t('results.winnerN', { n: r.rank })}</Badge>
                {r.entry && <Mono>{r.entry.public_entry_id}</Mono>}
              </div>
              {r.prize && <span className="text-sm font-medium">{r.prize}</span>}
            </div>
            {r.entry && (
              <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr_1.4fr]">
                <div className="text-sm">
                  <p className="font-semibold">{r.entry.display_name}</p>
                  <p className="text-navy-600">{r.entry.email ?? t('followup.noEmail')}</p>
                  <p className="mono text-navy-400">{r.entry.external_id}</p>
                </div>
                <select
                  className="input"
                  aria-label={t('followup.status')}
                  value={r.follow?.status ?? 'pending'}
                  onChange={(e) => void update(r.entry.id, { status: e.target.value as DeliveryStatus })}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {t(s.key)}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  aria-label={t('followup.noteLabel')}
                  placeholder={t('followup.noteLabel')}
                  maxLength={1000}
                  value={notes[r.entry.id] ?? r.follow?.contact_note ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.entry.id]: e.target.value })}
                  onBlur={() => notes[r.entry.id] !== undefined && void update(r.entry.id, { contact_note: notes[r.entry.id] })}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
