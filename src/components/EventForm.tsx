import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { LIMITS } from '@shared/limits'
import { useI18n } from '@/i18n'
import { fromBangkokInput, toBangkokInput } from '@/lib/time'
import { Alert, Spinner } from './ui'
import { Stepper } from './Stepper'

export interface EventFormValues {
  title: string
  description: string
  rules: string
  drawAt: Date
  winnerCount: number
  reserveCount: number
  prizes: string[]
}

export const EMPTY_FORM: EventFormValues = {
  title: '',
  description: '',
  rules: '',
  drawAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  winnerCount: 1,
  reserveCount: 0,
  prizes: [''],
}

/** Steps 1 and 2 of the wizard: details, then prizes and the number of winners / reserves. */
export function EventForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
}: {
  initial: EventFormValues
  submitLabel: string
  busy: boolean
  error?: string | null
  onSubmit: (values: EventFormValues) => void
}) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [rules, setRules] = useState(initial.rules)
  const [drawInput, setDrawInput] = useState(toBangkokInput(initial.drawAt))
  const [winnerCount, setWinnerCount] = useState(initial.winnerCount)
  const [reserveCount, setReserveCount] = useState(initial.reserveCount)
  const [prizes, setPrizes] = useState<string[]>(initial.prizes)

  const drawAt = fromBangkokInput(drawInput)
  const detailsErrors = useMemo(() => {
    const e: string[] = []
    if (!title.trim()) e.push(t('form.err.title'))
    if (!drawAt) e.push(t('form.err.time'))
    return e
  }, [title, drawAt, t])

  const picksTotal = winnerCount + reserveCount
  const prizeErrors = useMemo(() => {
    const e: string[] = []
    if (winnerCount < 1) e.push(t('form.err.winners'))
    if (picksTotal > LIMITS.maxPicks) e.push(t('form.err.picks', { max: LIMITS.maxPicks }))
    if (prizes.slice(0, winnerCount).some((p) => !p.trim())) e.push(t('form.err.prizeName'))
    return e
  }, [winnerCount, picksTotal, prizes, t])

  const setWinners = (n: number) => {
    const next = Math.max(0, Math.min(LIMITS.maxPicks, Math.floor(n) || 0))
    setWinnerCount(next)
    setPrizes((prev) => Array.from({ length: next }, (_, i) => prev[i] ?? ''))
  }

  return (
    <div className="card space-y-5">
      <Stepper current={step} />
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="title">
              {t('form.title')}
            </label>
            <input id="title" className="input" maxLength={LIMITS.maxTitleLength} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="description">
              {t('form.description')}
            </label>
            <textarea id="description" rows={3} className="input" maxLength={LIMITS.maxDescriptionLength} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="rules">
              {t('form.rules')}
            </label>
            <textarea id="rules" rows={4} className="input" maxLength={LIMITS.maxRulesLength} value={rules} onChange={(e) => setRules(e.target.value)} />
            <p className="hint">{t('form.rulesHint')}</p>
          </div>
          <div>
            <label className="label" htmlFor="drawAt">
              {t('form.drawAt')}
            </label>
            <input id="drawAt" type="datetime-local" className="input max-w-xs" value={drawInput} onChange={(e) => setDrawInput(e.target.value)} />
            <p className="hint">{t('form.drawAtHint')}</p>
          </div>
          {detailsErrors.length > 0 && <Alert tone="warn">{detailsErrors.join(' ')}</Alert>}
          <div className="flex justify-end">
            <button type="button" className="btn-primary" disabled={detailsErrors.length > 0} onClick={() => setStep(1)}>
              {t('common.next')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="winners">
                {t('form.winners')}
              </label>
              <input id="winners" type="number" min={1} max={LIMITS.maxPicks} className="input" value={winnerCount} onChange={(e) => setWinners(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="reserves">
                {t('form.reserves')}
              </label>
              <input
                id="reserves"
                type="number"
                min={0}
                max={LIMITS.maxPicks - 1}
                className="input"
                value={reserveCount}
                onChange={(e) => setReserveCount(Math.max(0, Math.min(LIMITS.maxPicks - 1, Math.floor(Number(e.target.value)) || 0)))}
              />
              <p className="hint">{t('form.reservesHint')}</p>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="label">{t('form.prizeOrder')}</legend>
            <p className="hint">{t('form.prizeOrderHint')}</p>
            {prizes.slice(0, winnerCount).map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="mono w-16 shrink-0 text-navy-500">{t('form.rank', { n: i + 1 })}</span>
                <input
                  aria-label={t('form.prizeFor', { n: i + 1 })}
                  className="input"
                  maxLength={LIMITS.maxPrizeNameLength}
                  value={name}
                  onChange={(e) => setPrizes((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                />
              </div>
            ))}
          </fieldset>
          <Alert tone="info">{t('form.outOfSystemPrize')}</Alert>
          {prizeErrors.length > 0 && <Alert tone="warn">{prizeErrors.join(' ')}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-between gap-3">
            <button type="button" className="btn-ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t('common.back')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || prizeErrors.length > 0 || !drawAt}
              onClick={() => drawAt && onSubmit({ title: title.trim(), description: description.trim(), rules: rules.trim(), drawAt, winnerCount, reserveCount, prizes: prizes.slice(0, winnerCount).map((p) => p.trim()) })}
            >
              {busy && <Spinner />}
              {submitLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
