import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Crown, ShieldCheck } from 'lucide-react'
import { useI18n } from '@/i18n'
import { usePublicBundle } from '@/hooks/public'
import { formatBangkok } from '@/lib/time'
import { PageLoading } from '@/components/ui'
import { phaseExplanationKey, PhaseBadge } from '@/components/StatusBadge'

/**
 * Projector view. It only ever reveals results that the contract has already finalized; the animation
 * is presentation and never takes part in choosing or changing a winner.
 */
export default function Live() {
  const { id } = useParams()
  const { t, lang, setLang } = useI18n()
  const reduce = useReducedMotion()
  const { event, chain, manifest } = usePublicBundle(id)
  const [revealed, setRevealed] = useState(0)

  const finalized = chain.data?.phase === 'finalized'
  const m = manifest.data?.state === 'ok' ? manifest.data.manifest : null
  const winners = chain.data?.winners ?? []
  const mainCount = chain.data?.winnerCount ?? 0
  const total = winners.length

  const next = useCallback(() => setRevealed((n) => Math.min(total, n + 1)), [total])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      }
      if (e.key === 'Escape') setRevealed(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next])

  if (event.isLoading) return <PageLoading label={t('common.loading')} />
  if (!event.data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-navy-950 p-6 text-white">
        <p>{t('notFound.body')}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-navy-950 px-6 py-8 text-white sm:px-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-display text-lg font-bold">
          <ShieldCheck className="h-5 w-5 text-gold-400" aria-hidden /> FairSlot
        </span>
        <div className="flex items-center gap-3">
          {chain.data && <PhaseBadge phase={chain.data.phase} />}
          <button type="button" className="rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/10" onClick={() => setLang(lang === 'th' ? 'en' : 'th')}>
            {lang === 'th' ? 'EN' : 'TH'}
          </button>
          <Link className="rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/10" to={`/events/${event.data.public_id}/verify`}>
            {t('public.verify')}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 py-10 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold sm:text-6xl">{m?.title ?? event.data.title}</h1>
          <p className="text-navy-200">{formatBangkok(event.data.draw_not_before, lang)}</p>
        </div>

        {!finalized && (
          <p className="max-w-xl text-lg text-navy-100 text-pretty" aria-live="polite">
            {chain.data ? t(phaseExplanationKey(chain.data.phase)) : t('public.notCommittedYet')}
          </p>
        )}

        {finalized && m && (
          <>
            <ol className="grid w-full max-w-3xl gap-3" aria-live="polite">
              <AnimatePresence initial={false}>
                {winners.slice(0, revealed).map((index, i) => {
                  const isReserve = i >= mainCount
                  return (
                    <motion.li
                      key={i}
                      initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-6 py-4 text-left ${isReserve ? 'bg-white/10' : 'bg-gold-400 text-navy-950'}`}
                    >
                      <div className="flex items-center gap-3">
                        {!isReserve && <Crown className="h-6 w-6" aria-hidden />}
                        <span className="text-sm font-semibold uppercase tracking-[0.08em]">{isReserve ? t('results.reserveN', { n: i - mainCount + 1 }) : t('results.winnerN', { n: i + 1 })}</span>
                      </div>
                      <span className="font-mono text-2xl font-medium tabular-nums sm:text-3xl">{m.entries[index]}</span>
                      <span className="text-base font-semibold">{!isReserve ? m.prizes[i]?.name : ''}</span>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ol>
            <div className="flex flex-col items-center gap-2">
              <button type="button" className="rounded-xl bg-teal-500 px-8 py-4 text-lg font-semibold text-white hover:bg-teal-600 disabled:opacity-40" onClick={next} disabled={revealed >= total}>
                {revealed === 0 ? t('live.revealFirst') : revealed >= total ? t('live.done') : t('live.revealNext', { n: revealed + 1, total })}
              </button>
              <p className="text-xs text-navy-300">{t('live.keys')}</p>
            </div>
          </>
        )}
        {finalized && !m && <p className="text-red-200">{t('public.manifestMissingBody')}</p>}
      </main>
    </div>
  )
}
