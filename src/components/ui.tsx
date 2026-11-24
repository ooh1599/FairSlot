import { useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, Copy, Info, Loader2, XCircle, HelpCircle } from 'lucide-react'
import clsx from 'clsx'
import { useI18n } from '@/i18n'

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-navy-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </span>
  )
}

export function PageLoading({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  )
}

type Tone = 'info' | 'warn' | 'error' | 'success'
const toneStyles: Record<Tone, string> = {
  info: 'border-navy-200 bg-navy-50 text-navy-800',
  warn: 'border-gold-300 bg-gold-100/70 text-gold-700',
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-teal-200 bg-teal-50 text-teal-700',
}
const toneIcon: Record<Tone, ReactNode> = {
  info: <Info className="h-4 w-4" aria-hidden />,
  warn: <AlertTriangle className="h-4 w-4" aria-hidden />,
  error: <XCircle className="h-4 w-4" aria-hidden />,
  success: <CheckCircle2 className="h-4 w-4" aria-hidden />,
}

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div className={clsx('flex gap-3 rounded-xl border px-4 py-3 text-sm', toneStyles[tone])} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="mt-0.5 shrink-0">{toneIcon[tone]}</span>
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-pretty">{children}</div>}
      </div>
    </div>
  )
}

export function Badge({ tone = 'info', children }: { tone?: Tone | 'neutral' | 'gold'; children: ReactNode }) {
  const styles: Record<string, string> = {
    info: 'bg-navy-100 text-navy-800',
    neutral: 'bg-navy-50 text-navy-600',
    warn: 'bg-gold-100 text-gold-700',
    gold: 'bg-gold-300 text-navy-950',
    error: 'bg-red-100 text-red-800',
    success: 'bg-teal-100 text-teal-700',
  }
  return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', styles[tone])}>{children}</span>
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-navy-200 bg-white/50 px-6 py-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-navy-600 text-pretty">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-navy-600 hover:bg-navy-100"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? t('common.copied') : (label ?? t('common.copy'))}
    </button>
  )
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="mono break-all rounded bg-navy-50 px-1.5 py-0.5 text-navy-800">{children}</span>
}

export type CheckState = 'ok' | 'fail' | 'pending' | 'unknown'

export function CheckIcon({ state }: { state: CheckState }) {
  if (state === 'ok') return <CheckCircle2 className="h-5 w-5 text-teal-600" aria-hidden />
  if (state === 'fail') return <XCircle className="h-5 w-5 text-red-600" aria-hidden />
  if (state === 'pending') return <Loader2 className="h-5 w-5 animate-spin text-navy-400" aria-hidden />
  return <HelpCircle className="h-5 w-5 text-gold-500" aria-hidden />
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-navy-600 text-pretty">{children}</div>}
    </div>
  )
}
