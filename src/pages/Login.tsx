import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { requireSupabase } from '@/lib/supabase'
import { Alert, Spinner } from '@/components/ui'
import { BackendNotice } from '@/components/Guards'
import { BACKEND_CONFIGURED } from '@/lib/env'

export default function Login() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!BACKEND_CONFIGURED) return <BackendNotice />
  if (user) return <Navigate to={from} replace />

  const sendLink = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await requireSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    })
    setBusy(false)
    if (err) setError(t('login.sendFailed'))
    else setSent(true)
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await requireSupabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (err) setError(t('login.codeInvalid'))
    else void navigate(from, { replace: true })
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card space-y-5">
        <div>
          <p className="eyebrow">{t('login.eyebrow')}</p>
          <h1 className="text-2xl font-bold">{t('login.title')}</h1>
          <p className="mt-1 text-sm text-navy-600">{t('login.body')}</p>
        </div>
        {!sent ? (
          <form onSubmit={(e) => void sendLink(e)} className="space-y-3">
            <div>
              <label className="label" htmlFor="email">
                {t('login.email')}
              </label>
              <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn-primary w-full" disabled={busy || !email}>
              {busy ? <Spinner /> : <Mail className="h-4 w-4" aria-hidden />}
              {t('login.send')}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void verify(e)} className="space-y-3">
            <Alert tone="success" title={t('login.sentTitle')}>
              {t('login.sentBody', { email })}
            </Alert>
            <div>
              <label className="label" htmlFor="code">
                {t('login.code')}
              </label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" className="input mono" value={code} onChange={(e) => setCode(e.target.value)} />
              <p className="hint">{t('login.codeHint')}</p>
            </div>
            <button className="btn-primary w-full" disabled={busy || code.length < 6}>
              {busy && <Spinner />}
              {t('login.verify')}
            </button>
          </form>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </div>
  )
}
