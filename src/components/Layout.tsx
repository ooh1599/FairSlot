import { Link, NavLink, Outlet } from 'react-router-dom'
import { Languages } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { IS_TESTNET } from '@/lib/env'
import { Badge } from './ui'

/** Four dots in a square; one is the winner. */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden>
      <rect width="36" height="36" rx="10" fill="#0A1B33" />
      <circle cx="12" cy="12" r="3.2" fill="#ffffff" fillOpacity="0.35" />
      <circle cx="24" cy="12" r="3.2" fill="#F4B942" />
      <circle cx="12" cy="24" r="3.2" fill="#ffffff" fillOpacity="0.35" />
      <circle cx="24" cy="24" r="3.2" fill="none" stroke="#2CC4B8" strokeWidth="1.8" />
    </svg>
  )
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-navy-900">
      <LogoMark />
      FairSlot
    </Link>
  )
}

export function Layout() {
  const { t, lang, setLang } = useI18n()
  const { user } = useAuth()
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3.5 py-2 text-sm font-semibold transition ${isActive ? 'bg-navy-900 text-white' : 'text-navy-700 hover:bg-navy-900/5'}`
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        {t('common.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 border-b border-navy-900/[0.06] bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            {IS_TESTNET && <Badge tone="warn">{t('common.testnet')}</Badge>}
          </div>
          <nav className="flex items-center gap-1" aria-label={t('nav.main')}>
            <NavLink to="/verify" className={link}>
              {t('nav.verify')}
            </NavLink>
            {user && (
              <>
                <NavLink to="/dashboard" className={link}>
                  {t('nav.dashboard')}
                </NavLink>
                <NavLink to="/settings" className={link}>
                  {t('nav.settings')}
                </NavLink>
              </>
            )}
            {!user && (
              <NavLink to="/login" className={link}>
                {t('nav.login')}
              </NavLink>
            )}
            <button
              type="button"
              className="ml-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-navy-900/10 bg-white/70 px-3 text-sm font-semibold text-navy-800 hover:bg-white"
              onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
              aria-label={t('nav.switchLanguage')}
            >
              <Languages className="h-4 w-4" aria-hidden />
              {lang === 'th' ? 'EN' : 'ไทย'}
            </button>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-t border-navy-900/[0.08] bg-white/40 py-10 pb-24 text-xs text-navy-500">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-[auto_1fr] md:gap-16">
          <div className="flex items-center gap-2.5 font-display text-lg font-bold text-navy-900">
            <LogoMark className="h-8 w-8" />
            FairSlot
          </div>
          <div className="max-w-3xl space-y-2 leading-relaxed">
            <p className="text-pretty">{t('footer.honest')}</p>
            <p className="text-pretty">{t('footer.noGambling')}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
