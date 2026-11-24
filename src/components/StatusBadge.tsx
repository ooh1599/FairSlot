import { useI18n, type MessageKey } from '@/i18n'
import type { Phase } from '@/lib/chain'
import type { DbEvent } from '@/hooks/data'
import { Badge } from './ui'

const PHASE_KEY: Record<Phase, MessageKey> = {
  'not-committed': 'phase.notCommitted',
  committed: 'phase.committed',
  cancelled: 'phase.cancelled',
  'requested-pending': 'phase.requestedPending',
  'requested-expired': 'phase.requestedExpired',
  'callback-failed': 'phase.callbackFailed',
  received: 'phase.received',
  finalizing: 'phase.finalizing',
  finalized: 'phase.finalized',
  failed: 'phase.failed',
}

const PHASE_TONE: Record<Phase, 'info' | 'warn' | 'error' | 'success' | 'neutral' | 'gold'> = {
  'not-committed': 'neutral',
  committed: 'info',
  cancelled: 'neutral',
  'requested-pending': 'warn',
  'requested-expired': 'error',
  'callback-failed': 'warn',
  received: 'info',
  finalizing: 'warn',
  finalized: 'gold',
  failed: 'error',
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  const { t } = useI18n()
  return <Badge tone={PHASE_TONE[phase]}>{t(PHASE_KEY[phase])}</Badge>
}

export function DraftBadge({ status }: { status: DbEvent['status'] }) {
  const { t } = useI18n()
  const key: Record<DbEvent['status'], MessageKey> = { draft: 'status.draft', locked: 'status.locked', committed: 'status.committed' }
  return <Badge tone={status === 'draft' ? 'neutral' : status === 'locked' ? 'warn' : 'info'}>{t(key[status])}</Badge>
}

/** Plain-language explanation of the current phase, for people who do not know what a blockchain is. */
export function phaseExplanationKey(phase: Phase): MessageKey {
  const map: Record<Phase, MessageKey> = {
    'not-committed': 'phaseHelp.notCommitted',
    committed: 'phaseHelp.committed',
    cancelled: 'phaseHelp.cancelled',
    'requested-pending': 'phaseHelp.requestedPending',
    'requested-expired': 'phaseHelp.requestedExpired',
    'callback-failed': 'phaseHelp.callbackFailed',
    received: 'phaseHelp.received',
    finalizing: 'phaseHelp.finalizing',
    finalized: 'phaseHelp.finalized',
    failed: 'phaseHelp.failed',
  }
  return map[phase]
}
