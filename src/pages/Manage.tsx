import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { deriveOnchainEventId, useMyEvent, useOnchainEvent, type DbEvent } from '@/hooks/data'
import { requireSupabase } from '@/lib/supabase'
import { formatBangkok, shortHash } from '@/lib/time'
import { addressUrl, txUrl } from '@/lib/chain'
import { Alert, CopyButton, Mono, PageLoading, SectionTitle } from '@/components/ui'
import { DraftBadge } from '@/components/StatusBadge'
import { Stepper } from '@/components/Stepper'
import { EventForm } from '@/components/EventForm'
import { EntriesStep } from '@/components/EntriesStep'
import { ReviewStep } from '@/components/ReviewStep'
import { LockStep } from '@/components/LockStep'
import { DrawPanel } from '@/components/DrawPanel'
import { FollowupPanel } from '@/components/FollowupPanel'
import { NotFound } from '@/components/Guards'

type DraftStep = 'details' | 'entries' | 'review' | 'lock'

export default function Manage() {
  const { id } = useParams()
  const { t } = useI18n()
  const event = useMyEvent(id)
  if (event.isLoading) return <PageLoading label={t('common.loading')} />
  if (event.isError) return <Alert tone="error">{t('common.loadFailed')}</Alert>
  if (!event.data) return <NotFound />
  return <ManageEvent event={event.data} />
}

function ManageEvent({ event }: { event: DbEvent }) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [step, setStep] = useState<DraftStep>('entries')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onchainId = event.status === 'committed' ? deriveOnchainEventId(event.public_id, event.organizer_wallet) : null
  const chain = useOnchainEvent(onchainId)

  const saveDetails = async (v: Parameters<React.ComponentProps<typeof EventForm>['onSubmit']>[0]) => {
    setBusy(true)
    setError(null)
    const { error: err } = await requireSupabase()
      .from('events')
      .update({ title: v.title, description: v.description, rules: v.rules, draw_not_before: v.drawAt.toISOString(), winner_count: v.winnerCount, reserve_count: v.reserveCount, prizes: v.prizes.map((name, i) => ({ rank: i + 1, name })) })
      .eq('id', event.id)
    setBusy(false)
    if (err) return setError(t('form.saveFailed'))
    await queryClient.invalidateQueries({ queryKey: ['my-event', event.public_id] })
    setStep('entries')
  }

  const removeDraft = async () => {
    if (!window.confirm(t('manage.confirmDelete'))) return
    const { error: err } = await requireSupabase().from('events').delete().eq('id', event.id)
    if (err) return setError(t('form.saveFailed'))
    await queryClient.invalidateQueries({ queryKey: ['my-events'] })
    void navigate('/dashboard')
  }

  const header = (
    <SectionTitle eyebrow={t('manage.eyebrow')} title={event.title}>
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <DraftBadge status={event.status} />
        <span>{formatBangkok(event.draw_not_before, lang)}</span>
      </span>
    </SectionTitle>
  )

  if (event.status === 'draft') {
    const current = step === 'details' ? 0 : step === 'entries' ? 2 : step === 'review' ? 3 : 4
    return (
      <div className="mx-auto max-w-5xl">
        {header}
        <Stepper current={current} />
        {error && <Alert tone="error">{error}</Alert>}
        {step === 'details' && (
          <EventForm
            initial={{ title: event.title, description: event.description, rules: event.rules, drawAt: new Date(event.draw_not_before), winnerCount: event.winner_count, reserveCount: event.reserve_count, prizes: event.prizes.map((p) => p.name) }}
            submitLabel={t('common.save')}
            busy={busy}
            error={error}
            onSubmit={(v) => void saveDetails(v)}
          />
        )}
        {step === 'entries' && (
          <div className="space-y-6">
            <EntriesStep event={event} />
            <div className="flex flex-wrap justify-between gap-3">
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={() => setStep('details')}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  {t('manage.editDetails')}
                </button>
                <button type="button" className="btn-danger" onClick={() => void removeDraft()}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t('manage.deleteDraft')}
                </button>
              </div>
              <button type="button" className="btn-primary" onClick={() => setStep('review')}>
                {t('common.next')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}
        {step === 'review' && <ReviewStep event={event} onBack={() => setStep('entries')} onLock={() => setStep('lock')} />}
        {step === 'lock' && (
          <div className="space-y-4">
            <LockStep event={event} />
            <button type="button" className="btn-ghost" onClick={() => setStep('review')}>
              {t('common.back')}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (event.status === 'locked') {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <Stepper current={4} />
        <LockStep event={event} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {header}
      <section className="card space-y-3 text-sm">
        <div className="flex flex-wrap gap-3">
          <Link className="btn-ghost" to={`/events/${event.public_id}`}>{t('manage.publicPage')}</Link>
          <Link className="btn-ghost" to={`/events/${event.public_id}/live`} target="_blank" rel="noopener noreferrer">{t('draw.openLive')}</Link>
          <Link className="btn-ghost" to={`/events/${event.public_id}/verify`}>{t('draw.verify')}</Link>
        </div>
        <dl className="grid gap-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-navy-500">{t('lock.manifestHash')}</dt>
          <dd className="flex flex-wrap items-center gap-1"><Mono>{shortHash(event.manifest_hash ?? '', 14, 10)}</Mono> <CopyButton value={event.manifest_hash ?? ''} /></dd>
          {event.commit_tx_hash && (
            <>
              <dt className="text-navy-500">{t('manage.commitTx')}</dt>
              <dd><a className="inline-flex items-center gap-1 underline" href={txUrl(event.commit_tx_hash)} target="_blank" rel="noopener noreferrer"><span className="mono">{shortHash(event.commit_tx_hash)}</span><ExternalLink className="h-3 w-3" aria-hidden /></a></dd>
            </>
          )}
          {event.organizer_wallet && (
            <>
              <dt className="text-navy-500">{t('manage.organizerWallet')}</dt>
              <dd><a className="inline-flex items-center gap-1 underline" href={addressUrl(event.organizer_wallet)} target="_blank" rel="noopener noreferrer"><span className="mono">{shortHash(event.organizer_wallet, 8, 6)}</span><ExternalLink className="h-3 w-3" aria-hidden /></a></dd>
            </>
          )}
        </dl>
      </section>
      {chain.isLoading && <PageLoading label={t('common.loading')} />}
      {chain.isError && <Alert tone="error">{t('common.loadFailed')}</Alert>}
      {chain.data === null && <Alert tone="warn">{t('manage.notOnchain')}</Alert>}
      {chain.data && <DrawPanel event={event} chain={chain.data} />}
      {chain.data?.phase === 'finalized' && <FollowupPanel event={event} chain={chain.data} />}
    </div>
  )
}
