import { useState } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useEntries, type DbEvent } from '@/hooks/data'
import { formatBangkok } from '@/lib/time'
import { FAIRSLOT_ADDRESS } from '@/lib/env'
import { Alert, Badge, PageLoading } from './ui'

export function ReviewStep({ event, onBack, onLock }: { event: DbEvent; onBack: () => void; onLock: () => void }) {
  const { t, lang } = useI18n()
  const entries = useEntries(event.id)
  const [ack, setAck] = useState(false)
  if (entries.isLoading) return <PageLoading label={t('common.loading')} />
  const all = entries.data ?? []
  const picks = event.winner_count + event.reserve_count
  const names = new Map<string, number>()
  for (const e of all) names.set(e.display_name.toLocaleLowerCase(), (names.get(e.display_name.toLocaleLowerCase()) ?? 0) + 1)
  const dupNames = [...names.values()].filter((n) => n > 1).length
  const blockers: string[] = []
  if (all.length < picks) blockers.push(t('review.notEnough', { picks, count: all.length }))
  if (!FAIRSLOT_ADDRESS) blockers.push(t('lock.contractMissing'))

  return (
    <div className="card space-y-5">
      <h2 className="text-xl font-semibold">{t('review.title')}</h2>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-navy-500">{t('form.title')}</dt>
          <dd className="font-semibold">{event.title}</dd>
        </div>
        <div>
          <dt className="text-navy-500">{t('form.drawAt')}</dt>
          <dd className="font-semibold">{formatBangkok(event.draw_not_before, lang)}</dd>
        </div>
        <div>
          <dt className="text-navy-500">{t('review.participants')}</dt>
          <dd className="font-semibold tabular-nums">{all.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-navy-500">{t('review.picks')}</dt>
          <dd className="font-semibold">{t('dashboard.picks', { winners: event.winner_count, reserves: event.reserve_count })}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-2 font-semibold">{t('review.prizeOrder')}</h3>
        <ol className="space-y-1 text-sm">
          {event.prizes.map((p) => (
            <li key={p.rank} className="flex items-center gap-2">
              <Badge tone="gold">{t('results.winnerN', { n: p.rank })}</Badge>
              {p.name}
            </li>
          ))}
          {event.reserve_count > 0 && <li className="text-navy-600">{t('review.reserveRule', { n: event.reserve_count })}</li>}
        </ol>
      </div>
      {event.rules && (
        <div>
          <h3 className="mb-1 font-semibold">{t('form.rules')}</h3>
          <p className="whitespace-pre-wrap text-sm text-navy-700">{event.rules}</p>
        </div>
      )}
      {dupNames > 0 && <Alert tone="warn">{t('review.dupNames', { n: dupNames })}</Alert>}
      {blockers.map((b) => (
        <Alert key={b} tone="error">
          {b}
        </Alert>
      ))}
      <Alert tone="warn" title={t('review.lockWarnTitle')}>
        {t('review.lockWarn')}
      </Alert>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        {t('review.ack')}
      </label>
      <div className="flex justify-between gap-3">
        <button type="button" className="btn-ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('common.back')}
        </button>
        <button type="button" className="btn-primary" disabled={!ack || blockers.length > 0} onClick={onLock}>
          <Lock className="h-4 w-4" aria-hidden />
          {t('review.goLock')}
        </button>
      </div>
    </div>
  )
}
