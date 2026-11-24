import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { BACKEND_CONFIGURED } from '@/lib/env'
import { PageLoading } from './ui'

export function BackendNotice() {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="card space-y-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-100 text-gold-700">
          <Info className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold">{t('setup.backendMissingTitle')}</h1>
          <p className="text-navy-600 text-pretty">{t('setup.backendMissingBody')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/verify" className="btn-primary">
            {t('nav.verify')}
          </Link>
          <Link to="/" className="btn-ghost">
            {t('notFound.home')}
          </Link>
        </div>
        <details className="text-xs text-navy-500">
          <summary className="cursor-pointer font-medium">{t('setup.ownerSummary')}</summary>
          <p className="mt-2 text-pretty">{t('setup.ownerBody')}</p>
        </details>
      </div>
    </div>
  )
}

export function RequireBackend({ children }: { children: ReactNode }) {
  return BACKEND_CONFIGURED ? <>{children}</> : <BackendNotice />
}

/** Organizer pages: need a configured backend and a signed-in user. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const { t } = useI18n()
  if (!BACKEND_CONFIGURED) return <BackendNotice />
  if (loading) return <PageLoading label={t('common.loading')} />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

export function NotFound() {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-3xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-navy-600">{t('notFound.body')}</p>
      <Link to="/" className="btn-primary mt-6">
        {t('notFound.home')}
      </Link>
    </div>
  )
}
