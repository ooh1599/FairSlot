import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ClipboardList, Dices, FileCheck2, Lock, Search, ShieldCheck, Trophy, UserRoundX, Wallet } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { IS_TESTNET } from '@/lib/env'
import { EVENT_ID_PATTERN } from '@shared/manifest'
import { HeroBoard } from '@/components/HeroBoard'

const STEPS: { icon: typeof Lock; title: MessageKey; body: MessageKey }[] = [
  { icon: ClipboardList, title: 'landing.step1.title', body: 'landing.step1.body' },
  { icon: Lock, title: 'landing.step2.title', body: 'landing.step2.body' },
  { icon: Dices, title: 'landing.step3.title', body: 'landing.step3.body' },
  { icon: Trophy, title: 'landing.step4.title', body: 'landing.step4.body' },
]

const PROMISES: MessageKey[] = ['landing.promise1', 'landing.promise2', 'landing.promise3', 'landing.promise4']
const FACTS: { icon: typeof Lock; key: MessageKey }[] = [
  { icon: Wallet, key: 'landing.fact1' },
  { icon: FileCheck2, key: 'landing.fact2' },
  { icon: ShieldCheck, key: 'landing.fact3' },
]
const LIMITS: MessageKey[] = ['landing.limit1', 'landing.limit2', 'landing.limit3', 'landing.limit4']

export default function Landing() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lookup, setLookup] = useState('')
  const [lookupError, setLookupError] = useState(false)
  const cta = user ? '/events/new' : '/login'

  const go = (e: FormEvent) => {
    e.preventDefault()
    const match = /fs_[0-9a-hjkmnp-tv-z]{20}/i.exec(lookup.trim())
    const id = match?.[0].toLowerCase()
    if (id && EVENT_ID_PATTERN.test(id)) void navigate(`/events/${id}`)
    else setLookupError(true)
  }

  return (
    <div className="space-y-20 sm:space-y-28">
      <section className="grid items-center gap-12 pt-4 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-10">
        <div className="space-y-7">
          <span className="chip">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
            </span>
            {t('landing.network', { chain: IS_TESTNET ? 'Arc Testnet' : 'Arc Mainnet' })}
          </span>
          <h1 className="display text-5xl sm:text-6xl lg:text-7xl">{t('landing.title')}</h1>
          <p className="max-w-xl text-lg leading-relaxed text-navy-600 text-pretty">{t('landing.subtitle')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link to={cta} className="btn-primary min-h-[52px] px-6 text-base">
              {t('landing.cta')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href="#how" className="btn-ghost min-h-[52px] px-6 text-base">
              {t('landing.how')}
            </a>
          </div>
        </div>
        <HeroBoard />
      </section>

      <section aria-label={t('landing.factsLabel')}>
        <ul className="grid gap-px overflow-hidden rounded-2xl border border-navy-900/[0.07] bg-navy-900/[0.07] sm:grid-cols-3">
          {FACTS.map((f) => (
            <li key={f.key} className="flex items-center gap-3 bg-canvas/95 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-gold-300">
                <f.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-navy-800 text-pretty">{t(f.key)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="how" className="scroll-mt-24 space-y-10">
        <div className="max-w-2xl space-y-3">
          <p className="eyebrow">{t('landing.howEyebrow')}</p>
          <h2 className="display text-4xl sm:text-5xl">{t('landing.howTitle')}</h2>
        </div>
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card relative space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-900 text-gold-300 shadow-lift">
                  <step.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="font-display text-4xl font-bold text-navy-900/10 tabular-nums">0{i + 1}</span>
              </div>
              <h3 className="text-xl">{t(step.title)}</h3>
              <p className="text-sm leading-relaxed text-navy-600 text-pretty">{t(step.body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grain overflow-hidden rounded-[2rem] bg-navy-900 px-6 py-10 text-white sm:px-12 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div className="space-y-4">
            <ShieldCheck className="h-8 w-8 text-gold-400" aria-hidden />
            <h2 className="display text-4xl sm:text-5xl">{t('landing.promiseTitle')}</h2>
            <p className="max-w-sm text-navy-200 text-pretty">{t('landing.promiseLead')}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {PROMISES.map((key, i) => (
              <li key={key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <span className="mono text-gold-300">0{i + 1}</span>
                <p className="mt-2 text-sm leading-relaxed text-navy-50 text-pretty">{t(key)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card grid items-center gap-8 bg-teal-50/70 md:grid-cols-[1fr_1.2fr] md:p-10">
        <div className="space-y-2">
          <h2 className="display text-3xl sm:text-4xl">{t('landing.participantTitle')}</h2>
          <p className="text-sm leading-relaxed text-navy-600 text-pretty">{t('landing.participantBody')}</p>
        </div>
        <form onSubmit={go} className="space-y-2">
          <label htmlFor="lookup" className="label">
            {t('landing.lookupLabel')}
          </label>
          <div className="flex gap-2">
            <input
              id="lookup"
              className="input"
              placeholder="fs_xxxxxxxxxxxxxxxxxxxx"
              value={lookup}
              onChange={(e) => {
                setLookup(e.target.value)
                setLookupError(false)
              }}
            />
            <button className="btn-primary shrink-0">
              <Search className="h-4 w-4" aria-hidden />
              {t('landing.lookupGo')}
            </button>
          </div>
          {lookupError && <p className="text-sm text-red-700">{t('landing.lookupInvalid')}</p>}
          <Link to="/verify" className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 underline-offset-4 hover:underline">
            {t('landing.verifyChain')}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </form>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-2">
          <UserRoundX className="h-6 w-6 text-gold-500" aria-hidden />
          <h2 className="display text-3xl">{t('landing.limitsTitle')}</h2>
        </div>
        <ul className="divide-y divide-navy-900/[0.08] border-y border-navy-900/[0.08] text-sm text-navy-700">
          {LIMITS.map((key) => (
            <li key={key} className="py-3.5 text-pretty">
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[2rem] border border-navy-900/[0.08] bg-gradient-to-br from-gold-100 via-white to-teal-50 px-6 py-12 text-center sm:px-12">
        <h2 className="display mx-auto max-w-2xl text-4xl sm:text-5xl">{t('landing.finalTitle')}</h2>
        <p className="mx-auto mt-3 max-w-lg text-navy-600 text-pretty">{t('landing.finalBody')}</p>
        <Link to={cta} className="btn-primary mt-7 min-h-[52px] px-7 text-base">
          {t('landing.cta')}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </div>
  )
}
