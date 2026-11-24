import { motion, useReducedMotion } from 'framer-motion'
import { Dices, Lock, Trophy } from 'lucide-react'
import { useI18n } from '@/i18n'

const COLS = 12
const ROWS = 7
// Decorative only: a fixed pattern that shows how winners are positions in a sealed list.
const WINNERS = new Set([9, 27, 34, 52, 71])
const BACKUPS = new Set([15, 46, 63])

export function HeroBoard() {
  const { t } = useI18n()
  const reduce = useReducedMotion()
  const dots = Array.from({ length: COLS * ROWS }, (_, i) => i)
  return (
    <figure className="relative">
      <div className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-gold-300/40 via-transparent to-teal-400/30 blur-2xl" aria-hidden />
      <div className="grain overflow-hidden rounded-[1.75rem] bg-navy-900 p-5 text-white shadow-[0_30px_60px_-30px_rgba(10,27,51,0.8)] sm:p-7">
        <div className="mb-5 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-2 font-semibold text-navy-100">
            <Lock className="h-3.5 w-3.5 text-gold-400" aria-hidden />
            {t('landing.board.title')}
          </span>
          <ul className="flex items-center gap-4 text-navy-200">
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white/30" aria-hidden />
              {t('landing.board.entry')}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gold-400" aria-hidden />
              {t('landing.board.winner')}
            </li>
            <li className="hidden items-center gap-1.5 sm:flex">
              <span className="h-2 w-2 rounded-full border border-teal-400" aria-hidden />
              {t('landing.board.backup')}
            </li>
          </ul>
        </div>

        <div className="grid gap-x-3 gap-y-3.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }} aria-hidden>
          {dots.map((i) => {
            const winner = WINNERS.has(i)
            const backup = BACKUPS.has(i)
            return (
              <motion.span
                key={i}
                className={
                  winner
                    ? 'mx-auto h-3 w-3 rounded-full bg-gold-400 shadow-glow sm:h-3.5 sm:w-3.5'
                    : backup
                      ? 'mx-auto h-3 w-3 rounded-full border-2 border-teal-400 sm:h-3.5 sm:w-3.5'
                      : 'mx-auto h-2.5 w-2.5 rounded-full bg-white/25 sm:h-3 sm:w-3'
                }
                initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: reduce ? 0 : (i % COLS) * 0.02 + Math.floor(i / COLS) * 0.03, type: 'spring', stiffness: 260, damping: 20 }}
              />
            )
          })}
        </div>

        <ol className="mt-6 grid grid-cols-3 gap-2 border-t border-white/10 pt-5 text-[11px] leading-tight text-navy-100 sm:text-xs">
          {[
            { icon: Lock, key: 'landing.board.s1' as const },
            { icon: Dices, key: 'landing.board.s2' as const },
            { icon: Trophy, key: 'landing.board.s3' as const },
          ].map((s, i) => (
            <li key={s.key} className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-gold-300">
                <s.icon className="h-4 w-4" aria-hidden />
                <span className="mono text-navy-300">0{i + 1}</span>
              </span>
              <span className="text-pretty">{t(s.key)}</span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-3 px-1 text-xs text-navy-500 text-pretty">{t('landing.board.caption')}</figcaption>
    </figure>
  )
}
