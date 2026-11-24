import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'

export const WIZARD_STEPS: MessageKey[] = ['wizard.step.details', 'wizard.step.prizes', 'wizard.step.entries', 'wizard.step.review', 'wizard.step.lock']

export function Stepper({ current }: { current: number }) {
  const { t } = useI18n()
  return (
    <ol className="mb-6 flex flex-wrap gap-2" aria-label={t('wizard.progress')}>
      {WIZARD_STEPS.map((key, i) => {
        const done = i < current
        const active = i === current
        return (
          <li
            key={key}
            aria-current={active ? 'step' : undefined}
            className={clsx(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
              active && 'bg-navy-900 text-white',
              done && 'bg-teal-100 text-teal-700',
              !active && !done && 'bg-white/70 text-navy-500',
            )}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs">
              {done ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
            </span>
            {t(key)}
          </li>
        )
      })}
    </ol>
  )
}
