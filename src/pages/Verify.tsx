import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, ExternalLink } from 'lucide-react'
import { D20_EXPLORER } from '@shared/chains'
import { clientSeed, computeWinners } from '@shared/draw'
import { canonicalManifest } from '@shared/manifest'
import { useI18n, type MessageKey } from '@/i18n'
import { usePublicDelivery, type PublicEventRow, type useManifest, type useOnchainEvent } from '@/hooks/data'
import { usePublicBundle } from '@/hooks/public'
import { APP_CHAIN_ID, FAIRSLOT_ADDRESS } from '@/lib/env'
import { addressUrl, deliveryForWinners, safeHttpsUrl, txUrl } from '@/lib/chain'
import { shortHash } from '@/lib/time'
import { Alert, CheckIcon, CopyButton, Mono, PageLoading, type CheckState } from '@/components/ui'
import { ResultsList } from '@/components/Results'
import { NotFound } from '@/components/Guards'

interface Row {
  label: MessageKey
  ok: boolean | null
  detail?: string
}
interface Check {
  id: string
  title: MessageKey
  state: CheckState
  summary: MessageKey
  rows: Row[]
  note?: MessageKey
}

function stateOf(rows: Row[], pendingWhenNull = true): CheckState {
  if (rows.some((r) => r.ok === false)) return 'fail'
  if (rows.some((r) => r.ok === null)) return pendingWhenNull ? 'pending' : 'unknown'
  return 'ok'
}

interface ViewProps {
  event: PublicEventRow
  chain: ReturnType<typeof useOnchainEvent>
  manifest: ReturnType<typeof useManifest>
  manifestUri?: string
  manifestHash?: string
  delivery: { data?: { public_entry_id: string; rank: number; status: string }[] }
  /** Link back to the event page. Omitted when the page was opened from a chain lookup alone. */
  backTo?: string
}

export default function Verify() {
  const { id } = useParams()
  const { t } = useI18n()
  const { event, chain, manifest, manifestUri, manifestHash } = usePublicBundle(id)
  const delivery = usePublicDelivery(id, Boolean(chain.data))
  if (event.isLoading) return <PageLoading label={t('common.loading')} />
  if (!event.data) return <NotFound />
  return <VerifyView event={event.data} chain={chain} manifest={manifest} manifestUri={manifestUri} manifestHash={manifestHash} delivery={delivery} backTo={`/events/${event.data.public_id}`} />
}

export function VerifyView({ event, chain, manifest, manifestUri, manifestHash, delivery, backTo }: ViewProps) {
  const { t } = useI18n()
  const e = event
  const finalized = chain.data?.phase === 'finalized'

  const analysis = useMemo(() => {
    const c = chain.data
    const mf = manifest.data
    const m = mf?.state === 'ok' ? mf.manifest : null
    const checks: Check[] = []

    // 1. Manifest file matches the hash committed onchain
    {
      const rows: Row[] = []
      let state: CheckState
      if (!manifestHash || !manifestUri) state = 'unknown'
      else if (!mf || mf.state === 'loading') state = 'pending'
      else if (mf.state === 'ok') state = 'ok'
      else state = 'fail'
      if (mf?.state === 'mismatch') rows.push({ label: 'verify.row.hashEqual', ok: false, detail: mf.actualHash })
      if (mf?.state === 'missing') rows.push({ label: 'verify.row.fileAvailable', ok: false })
      if (mf?.state === 'invalid') rows.push({ label: 'verify.row.fileValid', ok: false, detail: mf.detail })
      if (mf?.state === 'ok') {
        rows.push({ label: 'verify.row.fileAvailable', ok: true })
        rows.push({ label: 'verify.row.hashEqual', ok: true, detail: mf.hash })
      }
      checks.push({
        id: 'manifest',
        title: 'verify.c1.title',
        state,
        summary: state === 'ok' ? 'verify.c1.ok' : state === 'fail' ? (mf?.state === 'mismatch' ? 'verify.c1.mismatch' : 'verify.c1.missing') : state === 'unknown' ? 'verify.c1.unknown' : 'verify.c1.pending',
        rows,
        note: 'verify.c1.note',
      })
    }

    // 2. Commitment exists onchain and matches the manifest
    {
      const rows: Row[] = []
      if (c) {
        rows.push({ label: 'verify.row.existsOnchain', ok: true, detail: c.eventId })
        if (m) {
          rows.push({ label: 'verify.row.organizer', ok: c.organizer.toLowerCase() === m.organizerWallet.toLowerCase(), detail: c.organizer })
          rows.push({ label: 'verify.row.counts', ok: c.participantCount === m.participantCount && c.winnerCount === m.winnerCount && c.reserveCount === m.reserveCount, detail: `${c.participantCount} / ${c.winnerCount} / ${c.reserveCount}` })
          rows.push({ label: 'verify.row.contract', ok: m.chainId === APP_CHAIN_ID && FAIRSLOT_ADDRESS !== undefined && m.contractAddress.toLowerCase() === FAIRSLOT_ADDRESS, detail: m.contractAddress })
          rows.push({ label: 'verify.row.algorithm', ok: c.algorithmVersion === m.algorithmVersion, detail: `v${c.algorithmVersion}` })
          rows.push({ label: 'verify.row.time', ok: Number(c.drawNotBefore) === Math.floor(Date.parse(m.drawNotBeforeUtc) / 1000) })
        } else rows.push({ label: 'verify.row.needManifest', ok: null })
      }
      const noFile = Boolean(c) && !m && mf !== undefined && mf.state !== 'loading'
      const state: CheckState = !e ? 'unknown' : !c ? (chain.isLoading ? 'pending' : 'unknown') : noFile ? 'unknown' : stateOf(rows)
      checks.push({ id: 'commit', title: 'verify.c2.title', state, summary: noFile ? 'verify.c2.noFile' : state === 'ok' ? 'verify.c2.ok' : state === 'fail' ? 'verify.c2.fail' : state === 'unknown' ? 'verify.c2.unknown' : 'verify.c2.pending', rows })
    }

    // 3. Randomness accepted by the coordinator and bound to this event
    {
      const rows: Row[] = []
      let state: CheckState = 'unknown'
      if (c && c.requestId === 0n) state = 'pending'
      if (c?.request && FAIRSLOT_ADDRESS) {
        const seed = clientSeed(BigInt(APP_CHAIN_ID), FAIRSLOT_ADDRESS, c.eventId, c.manifestHash)
        rows.push({ label: 'verify.row.consumer', ok: c.request.consumer.toLowerCase() === FAIRSLOT_ADDRESS })
        rows.push({ label: 'verify.row.seed', ok: c.request.clientSeed.toLowerCase() === seed.toLowerCase(), detail: seed })
        rows.push({ label: 'verify.row.refund', ok: c.request.refundAddress.toLowerCase() === c.refundRecipient.toLowerCase(), detail: c.refundRecipient })
        rows.push({ label: 'verify.row.accepted', ok: c.request.fulfilled ? true : c.phase === 'requested-expired' || c.phase === 'failed' ? false : null })
        if (c.request.fulfilled) rows.push({ label: 'verify.row.proofHash', ok: BigInt(c.request.proofHash) !== 0n, detail: c.request.proofHash })
        state = stateOf(rows)
      }
      checks.push({ id: 'proof', title: 'verify.c3.title', state, summary: state === 'ok' ? 'verify.c3.ok' : state === 'fail' ? 'verify.c3.fail' : state === 'pending' ? 'verify.c3.pending' : 'verify.c3.unknown', rows, note: 'verify.c3.note' })
    }

    // 4. Callback delivered to FairSlot
    {
      const rows: Row[] = []
      let state: CheckState = 'unknown'
      if (c?.request) {
        if (c.request.fulfilled) {
          rows.push({ label: 'verify.row.delivered', ok: c.request.delivered })
          rows.push({ label: 'verify.row.sameWord', ok: c.state >= 3 ? c.randomWord.toLowerCase() === c.request.randomness.toLowerCase() : null, detail: c.state >= 3 ? c.randomWord : undefined })
          state = stateOf(rows)
          if (!c.request.delivered) state = 'fail'
        } else state = c.phase === 'requested-pending' ? 'pending' : 'unknown'
      }
      checks.push({ id: 'callback', title: 'verify.c4.title', state, summary: state === 'ok' ? 'verify.c4.ok' : state === 'fail' ? 'verify.c4.fail' : state === 'pending' ? 'verify.c4.pending' : 'verify.c4.unknown', rows })
    }

    // 5. Winner indices recomputed independently in TypeScript
    let recomputed: number[] | null = null
    {
      const rows: Row[] = []
      let state: CheckState = 'unknown'
      if (c && c.state >= 3 && FAIRSLOT_ADDRESS && c.request?.fulfilled) {
        recomputed = computeWinners({
          chainId: BigInt(APP_CHAIN_ID),
          contract: FAIRSLOT_ADDRESS,
          eventId: c.eventId,
          manifestHash: c.manifestHash,
          requestId: c.requestId,
          randomWord: c.randomWord,
          participantCount: c.participantCount,
          winnerCount: c.winnerCount,
          reserveCount: c.reserveCount,
        })
        const drawnSoFar = c.winners.length
        const same = c.winners.every((w, i) => w === recomputed?.[i])
        rows.push({ label: 'verify.row.recomputed', ok: same, detail: recomputed.slice(0, drawnSoFar).join(', ') })
        rows.push({ label: 'verify.row.complete', ok: c.state === 5 ? true : null })
        state = same ? (c.state === 5 ? 'ok' : 'pending') : 'fail'
      }
      checks.push({ id: 'winners', title: 'verify.c5.title', state, summary: state === 'ok' ? 'verify.c5.ok' : state === 'fail' ? 'verify.c5.fail' : state === 'pending' ? 'verify.c5.pending' : 'verify.c5.unknown', rows })
    }

    // 6. Delivery: the organizer's own statement
    {
      const rows = m && chain.data ? deliveryForWinners(delivery.data ?? [], chain.data.winners, m.entries) : []
      const delivered = rows.filter((r) => r.status === 'delivered').length
      const state: CheckState = rows.length === 0 ? 'unknown' : delivered === rows.length ? 'ok' : 'pending'
      checks.push({
        id: 'delivery',
        title: 'verify.c6.title',
        state,
        summary: rows.length === 0 ? 'verify.c6.none' : delivered === rows.length ? 'verify.c6.all' : 'verify.c6.some',
        rows: rows.length ? [{ label: 'verify.row.deliveredCount', ok: delivered === rows.length ? true : null, detail: `${delivered} / ${rows.length}` }] : [],
        note: 'verify.c6.note',
      })
    }
    return { checks, recomputed, m }
  }, [e, chain.data, chain.isLoading, manifest.data, manifestHash, manifestUri, delivery.data])

  const core = analysis.checks.slice(0, 5)
  const verdict: 'ok' | 'fail' | 'incomplete' = core.some((c) => c.state === 'fail') ? 'fail' : core.every((c) => c.state === 'ok') ? 'ok' : 'incomplete'
  const d20 = D20_EXPLORER[APP_CHAIN_ID]

  const downloadBundle = () => {
    const c = chain.data
    const payload = {
      generatedAt: new Date().toISOString(),
      chainId: APP_CHAIN_ID,
      contract: FAIRSLOT_ADDRESS,
      eventPublicId: e.public_id,
      manifestHash,
      manifestUri,
      manifest: analysis.m ? (JSON.parse(canonicalManifest(analysis.m)) as unknown) : null,
      onchain: c ? (JSON.parse(JSON.stringify({ ...c }, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))) as unknown) : null,
      recomputedWinners: analysis.recomputed,
      commitTx: e.commit_tx_hash,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${e.public_id}-evidence.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">{t('verify.eyebrow')}</p>
        <h1 className="text-3xl font-bold sm:text-4xl">{e.title}</h1>
        <p className="max-w-2xl text-navy-600 text-pretty">{t('verify.intro')}</p>
      </header>

      <Alert tone={verdict === 'ok' ? 'success' : verdict === 'fail' ? 'error' : 'warn'} title={t(verdict === 'ok' ? 'verify.verdict.ok' : verdict === 'fail' ? 'verify.verdict.fail' : 'verify.verdict.incomplete')}>
        {t(verdict === 'ok' ? 'verify.verdict.okBody' : verdict === 'fail' ? 'verify.verdict.failBody' : 'verify.verdict.incompleteBody')}
      </Alert>

      <ol className="space-y-3">
        {analysis.checks.map((c, i) => (
          <li key={c.id} className="card space-y-3">
            <div className="flex items-start gap-3">
              <CheckIcon state={c.state} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">
                  {i + 1}. {t(c.title)}
                </h2>
                <p className="text-sm text-navy-700 text-pretty">{t(c.summary)}</p>
              </div>
            </div>
            {c.rows.length > 0 && (
              <ul className="space-y-1 border-t border-navy-100 pt-3 text-sm">
                {c.rows.map((r, k) => (
                  <li key={k} className="flex flex-wrap items-center gap-2">
                    <CheckIcon state={r.ok === null ? 'pending' : r.ok ? 'ok' : 'fail'} />
                    <span>{t(r.label)}</span>
                    {r.detail && <Mono>{r.detail.length > 24 ? shortHash(r.detail, 12, 8) : r.detail}</Mono>}
                  </li>
                ))}
              </ul>
            )}
            {c.note && <p className="text-xs text-navy-500 text-pretty">{t(c.note)}</p>}
          </li>
        ))}
      </ol>

      {finalized && analysis.m && chain.data && (
        <section className="card space-y-3">
          <h2 className="text-xl font-semibold">{t('public.results')}</h2>
          <ResultsList manifest={analysis.m} winners={chain.data.winners} winnerCount={chain.data.winnerCount} />
        </section>
      )}

      <section className="card space-y-3 text-sm">
        <h2 className="text-lg font-semibold">{t('verify.evidence')}</h2>
        <dl className="grid gap-2 sm:grid-cols-[auto_1fr]">
          {manifestHash && (<><dt className="text-navy-500">{t('lock.manifestHash')}</dt><dd className="flex flex-wrap items-center gap-1"><Mono>{shortHash(manifestHash, 14, 10)}</Mono><CopyButton value={manifestHash} /></dd></>)}
          {safeHttpsUrl(manifestUri) && (<><dt className="text-navy-500">{t('verify.manifestUri')}</dt><dd><a className="inline-flex items-center gap-1 underline" href={safeHttpsUrl(manifestUri) ?? undefined} target="_blank" rel="noopener noreferrer">{t('verify.downloadManifest')}<ExternalLink className="h-3 w-3" aria-hidden /></a></dd></>)}
          {FAIRSLOT_ADDRESS && (<><dt className="text-navy-500">{t('verify.contract')}</dt><dd><a className="inline-flex items-center gap-1 underline" href={addressUrl(FAIRSLOT_ADDRESS)} target="_blank" rel="noopener noreferrer"><span className="mono">{shortHash(FAIRSLOT_ADDRESS, 8, 6)}</span><ExternalLink className="h-3 w-3" aria-hidden /></a></dd></>)}
          {e.commit_tx_hash && (<><dt className="text-navy-500">{t('manage.commitTx')}</dt><dd><a className="inline-flex items-center gap-1 underline" href={txUrl(e.commit_tx_hash)} target="_blank" rel="noopener noreferrer"><span className="mono">{shortHash(e.commit_tx_hash)}</span><ExternalLink className="h-3 w-3" aria-hidden /></a></dd></>)}
          {chain.data && chain.data.requestId !== 0n && (<><dt className="text-navy-500">{t('verify.requestId')}</dt><dd className="flex flex-wrap items-center gap-1"><Mono>{chain.data.requestId.toString()}</Mono><a className="inline-flex items-center gap-1 underline" href={d20} target="_blank" rel="noopener noreferrer">{t('verify.d20Explorer')}<ExternalLink className="h-3 w-3" aria-hidden /></a></dd></>)}
        </dl>
        <div className="flex flex-wrap gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={downloadBundle}>
            <Download className="h-4 w-4" aria-hidden />
            {t('verify.downloadEvidence')}
          </button>
          {backTo && <Link className="btn-ghost" to={backTo}>{t('verify.backToEvent')}</Link>}
        </div>
        <p className="text-xs text-navy-500 text-pretty">{t('verify.trust')}</p>
      </section>
    </div>
  )
}
