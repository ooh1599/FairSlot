import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider, useI18n } from '@/i18n'
import { AuthProvider } from '@/context/AuthContext'
import { Layout } from '@/components/Layout'
import { NotFound, RequireAuth, RequireBackend } from '@/components/Guards'
import { PageLoading } from '@/components/ui'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const NewEvent = lazy(() => import('@/pages/NewEvent'))
const Manage = lazy(() => import('@/pages/Manage'))
const PublicEvent = lazy(() => import('@/pages/PublicEvent'))
const Live = lazy(() => import('@/pages/Live'))
const Verify = lazy(() => import('@/pages/Verify'))
const Settings = lazy(() => import('@/pages/Settings'))
const VerifyChain = lazy(() => import('@/pages/VerifyChain'))
const VerifyLookup = lazy(() => import('@/pages/VerifyChain').then((m) => ({ default: m.VerifyLookup })))

function Loading() {
  const { t } = useI18n()
  return <PageLoading label={t('common.loading')} />
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/events/:id/live" element={<RequireBackend><Live /></RequireBackend>} />
              <Route element={<Layout />}>
                <Route index element={<Landing />} />
                <Route path="login" element={<Login />} />
                <Route path="dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
                <Route path="events/new" element={<RequireAuth><NewEvent /></RequireAuth>} />
                <Route path="events/:id/manage" element={<RequireAuth><Manage /></RequireAuth>} />
                <Route path="events/:id" element={<RequireBackend><PublicEvent /></RequireBackend>} />
                <Route path="events/:id/verify" element={<RequireBackend><Verify /></RequireBackend>} />
                <Route path="verify" element={<VerifyLookup />} />
                <Route path="verify/:eventId" element={<VerifyChain />} />
                <Route path="settings" element={<RequireAuth><Settings /></RequireAuth>} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  )
}
