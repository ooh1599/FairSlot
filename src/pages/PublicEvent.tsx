import { deliveryForWinners } from '@/lib/chain'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarClock, Gift, MonitorPlay, Search, ShieldCheck } from 'lucide-react'
import { normalizeEntryIdInput } from '@shared/ids'
import { useI18n, type MessageKey } from '@/i18n'
import { usePublicDelivery, type DeliveryStatus } from '@/hooks/data'
import { usePublicBundle } from '@/hooks/public'
import { buildShareLink } from '@/lib/share'
import { formatBangkok } from '@/lib/time'
import { Alert, Badge, CopyButton, EmptyState, Mono, PageLoading } from '@/components/ui'
import { PhaseBadge, phaseExplanationKey } from '@/components/StatusBadge'
import { ResultsList } from '@/components/Results'
import { NotFound } from '@/components/Guards'

const DELIVERY_KEY: Record<DeliveryStatus, MessageKey> = {
  pending: 'followup.pending',
  contacted: 'followup.contacted',
  confirmed: 'followup.confirmed',
  delivered: 'followup.delivered',
  declined: 'followup.declined',
  no_response: 'followup.noResponse',
}
const PAGE = 100

export default function PublicEvent() {
  const { id } = useParams()
  const { t, lang } = useI18n()
  const { event, chain, manifest } = usePublicBundle(id)
  const finalized = chain.data?.phase === 'finalized'
  const delivery = usePublicDelivery(id, finalized)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [lookup, setLookup] = useState('')
  const [checked, setChecked] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (id) void buildShareLink(`/events/${id}`).then(setShareLink)
  }, [id])

  const m = manifest.data?.state === 'ok' ? manifest.data.manifest : null
  const deliveryMap = useMemo(() => {
    const rows = m && chain.data ? deliveryForWinners(delivery.data ?? [], chain.data.winners, m.entries) : []
    return new Map(rows.map((d) => [d.public_entry_id, t(DELIVERY_KEY[d.status])]))
  }, [delivery.data, chain.data, m, t])
  const entries = useMemo(() => {
    const q = query.trim().toUpperCase()
    const list = m?.entries ?? []
    return q ? list.filter((e) => e.includes(q)) : list
  }, [m, query])

  if (event.isLoading) return <PageLoading label={t('common.loading')} />
  if (event.isError) return <Alert tone="error">{t('common.loadFailed')}</Alert>
  if (!event.data) return <NotFound />
  const e = event.data
  // Once the manifest is verified against the onchain hash, show the committed text, not the database copy.
  const view = { title: m?.title ?? e.title, description: m?.description ?? e.description, rules: m?.rules ?? e.rules, prizes: m?.prizes ?? e.prizes }

  const check = (ev: FormEvent) => {
    ev.preventDefault()
    setChecked(normalizeEntryIdInput(lookup))
  }
  const found = checked && m ? m.entries.indexOf(checked) : -1
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE))
  const winnerIndex = chain.data && found >= 0 ? chain.data.winners.indexOf(found) : -1

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {chain.data ? <PhaseBadge phase={chain.data.phase} /> : <Badge tone="warn">{t('public.awaitingCommit')}</Badge>}
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl">{view.title}</h1>
        {view.description && <p className="max-w-2xl whitespace-pre-wrap text-navy-700">{view.description}</p>}
        <p className="flex items-center gap-2 text-sm text-navy-600">
          <CalendarClock className="h-4 w-4" aria-hidden />
          {t('public.opensAt', { time: formatBangkok(e.draw_not_before, lang) })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to={`/events/${e.public_id}/verify`} className="btn-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {t('public.verify')}
          </Link>
          <Link to={`/events/${e.public_id}/live`} className="btn-ghost" target="_blank" rel="noopener noreferrer">
            <MonitorPlay className="h-4 w-4" aria-hidden />
            {t('public.live')}
          </Link>
          {shareLink && <CopyButton value={shareLink} label={t('public.copyLink')} />}
        </div>
      </header>

      {chain.data && <Alert tone={chain.data.phase === 'failed' || chain.data.phase === 'requested-expired' ? 'error' : 'info'}>{t(phaseExplanationKey(chain.data.phase))}</Alert>}
      {!chain.data && !chain.isLoading && <Alert tone="info">{t('public.notCommittedYet')}</Alert>}

      {manifest.data && manifest.data.state !== 'ok' && manifest.data.state !== 'loading' && (
        <Alert tone="error" title={t(manifest.data.state === 'mismatch' ? 'public.manifestMismatch' : 'public.manifestMissing')}>
          {t(manifest.data.state === 'mismatch' ? 'public.manifestMismatchBody' : 'public.manifestMissingBody')}
        </Alert>
      )}

      {finalized && m && chain.data && (
        <section className="card space-y-3">
          <h2 className="text-xl font-semibold">{t('public.results')}</h2>
          <ResultsList manifest={m} winners={chain.data.winners} winnerCount={chain.data.winnerCount} delivery={deliveryMap} />
          <p className="text-xs text-navy-500">{t('public.deliveryNote')}</p>
        </section>
      )}

      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-teal-600" aria-hidden />
          <h2 className="text-xl font-semibold">{t('public.prizes')}</h2>
        </div>
        <ol className="space-y-1 text-sm">
          {view.prizes.map((p) => (
            <li key={p.rank} className="flex items-center gap-2">
              <Badge tone="gold">{t('results.winnerN', { n: p.rank })}</Badge>
              {p.name}
            </li>
          ))}
          {e.reserve_count > 0 && <li className="text-navy-600">{t('review.reserveRule', { n: e.reserve_count })}</li>}
        </ol>
        {view.rules && (
          <div>
            <h3 className="mt-3 font-semibold">{t('form.rules')}</h3>
            <p className="whitespace-pre-wrap text-sm text-navy-700">{view.rules}</p>
          </div>
        )}
        <p className="text-xs text-navy-500">{t('public.outOfSystem')}</p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">{t('public.checkTitle')}</h2>
        <p className="text-sm text-navy-600">{t('public.checkBody')}</p>
        <form onSubmit={check} className="flex gap-2">
          <input className="input mono" aria-label={t('public.checkLabel')} placeholder="XXXX-XXXX-XXXX" value={lookup} onChange={(ev) => setLookup(ev.target.value)} />
          <button className="btn-teal shrink-0" disabled={!m}>
            <Search className="h-4 w-4" aria-hidden />
            {t('public.checkGo')}
          </button>
        </form>
        {!m && <p className="text-xs text-navy-500">{t('public.checkNeedsManifest')}</p>}
        {checked && m && (found >= 0 ? (
          <Alert tone="success" title={t('public.found', { id: checked })}>
            {winnerIndex >= 0
              ? winnerIndex < (chain.data?.winnerCount ?? 0)
                ? t('public.youWon', { prize: view.prizes[winnerIndex]?.name ?? '' })
                : t('public.youReserve', { n: winnerIndex - (chain.data?.winnerCount ?? 0) + 1 })
              : finalized
                ? t('public.notSelected')
                : t('public.inList')}
          </Alert>
        ) : (
          <Alert tone="warn" title={t('public.notFound')}>
            {t('public.notFoundBody')}
          </Alert>
        ))}
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">{t('public.participants', { n: m?.entries.length ?? e.winner_count })}</h2>
          <input className="input max-w-[14rem] mono" aria-label={t('common.search')} placeholder={t('common.search')} value={query} onChange={(ev) => { setQuery(ev.target.value); setPage(0) }} />
        </div>
        <p className="text-xs text-navy-500">{t('public.pseudonymous')}</p>
        {!m && <EmptyState title={t('public.noList')} />}
        {m && (
          <>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {entries.slice(page * PAGE, page * PAGE + PAGE).map((id) => (
                <li key={id}><Mono>{id}</Mono></li>
              ))}
            </ul>
            {pageCount > 1 && (
              <div className="flex items-center justify-between text-sm">
                <button type="button" className="btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('common.prev')}</button>
                <span className="tabular-nums">{page + 1} / {pageCount}</span>
                <button type="button" className="btn-ghost" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>{t('common.next')}</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
