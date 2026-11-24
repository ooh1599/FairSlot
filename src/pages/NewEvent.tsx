import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { generatePublicEventId } from '@shared/ids'
import { useI18n } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { requireSupabase } from '@/lib/supabase'
import { EMPTY_FORM, EventForm, type EventFormValues } from '@/components/EventForm'
import { SectionTitle } from '@/components/ui'

export default function NewEvent() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (v: EventFormValues) => {
    if (!user) return
    setBusy(true)
    setError(null)
    const publicId = generatePublicEventId()
    const { error: err } = await requireSupabase()
      .from('events')
      .insert({
        public_id: publicId,
        organizer_id: user.id,
        title: v.title,
        description: v.description,
        rules: v.rules,
        prizes: v.prizes.map((name, i) => ({ rank: i + 1, name })),
        winner_count: v.winnerCount,
        reserve_count: v.reserveCount,
        draw_not_before: v.drawAt.toISOString(),
      })
    setBusy(false)
    if (err) {
      setError(t('form.saveFailed'))
      return
    }
    void navigate(`/events/${publicId}/manage`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle eyebrow={t('wizard.eyebrow')} title={t('wizard.newTitle')}>
        {t('wizard.newBody')}
      </SectionTitle>
      <EventForm initial={EMPTY_FORM} submitLabel={t('wizard.saveAndContinue')} busy={busy} error={error} onSubmit={(v) => void create(v)} />
    </div>
  )
}
