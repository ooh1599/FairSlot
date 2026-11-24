import { Link } from 'react-router-dom'
import { CalendarClock, Plus, Users } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useMyEvents } from '@/hooks/data'
import { formatBangkok } from '@/lib/time'
import { Alert, EmptyState, PageLoading, SectionTitle } from '@/components/ui'
import { DraftBadge } from '@/components/StatusBadge'

export default function Dashboard() {
  const { t, lang } = useI18n()
  const events = useMyEvents()
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle eyebrow={t('dashboard.eyebrow')} title={t('dashboard.title')} />
        <Link to="/events/new" className="btn-primary mb-5">
          <Plus className="h-4 w-4" aria-hidden />
          {t('dashboard.new')}
        </Link>
      </div>
      {events.isLoading && <PageLoading label={t('common.loading')} />}
      {events.isError && <Alert tone="error">{t('common.loadFailed')}</Alert>}
      {events.data && events.data.length === 0 && (
        <EmptyState
          title={t('dashboard.emptyTitle')}
          body={t('dashboard.emptyBody')}
          action={
            <Link to="/events/new" className="btn-primary">
              {t('dashboard.new')}
            </Link>
          }
        />
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {events.data?.map((e) => (
          <li key={e.id}>
            <Link to={`/events/${e.public_id}/manage`} className="card block space-y-3 transition hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{e.title}</h2>
                <DraftBadge status={e.status} />
              </div>
              <p className="flex items-center gap-2 text-sm text-navy-600">
                <CalendarClock className="h-4 w-4" aria-hidden />
                {formatBangkok(e.draw_not_before, lang)}
              </p>
              <p className="flex items-center gap-2 text-sm text-navy-600">
                <Users className="h-4 w-4" aria-hidden />
                {t('dashboard.picks', { winners: e.winner_count, reserves: e.reserve_count })}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
