import { ExternalLink } from 'lucide-react'
import { useI18n, type MessageKey } from '@/i18n'
import { txUrl } from '@/lib/chain'
import { shortHash } from '@/lib/time'
import type { TxState } from '@/hooks/useTx'
import { Alert, Spinner } from './ui'

const ERROR_KEYS: Record<string, MessageKey> = {
  'insufficient-funds': 'tx.error.insufficientFunds',
  'draw-not-open': 'tx.error.drawNotOpen',
  'fee-changed': 'tx.error.feeChanged',
  'wrong-state': 'tx.error.wrongState',
  reverted: 'tx.error.reverted',
  timeout: 'tx.error.timeout',
  unknown: 'tx.error.unknown',
}

/** Transaction status: always shows the real hash and an explorer link once one exists. */
export function TxPanel({ state }: { state: TxState }) {
  const { t } = useI18n()
  if (state.phase === 'idle') return null
  const link = state.hash ? (
    <a className="inline-flex items-center gap-1 underline" href={txUrl(state.hash)} target="_blank" rel="noopener noreferrer">
      <span className="mono">{shortHash(state.hash)}</span>
      <ExternalLink className="h-3 w-3" aria-hidden />
      <span className="sr-only">{t('tx.openExplorer')}</span>
    </a>
  ) : null
  if (state.phase === 'signing') return <Spinner label={t('tx.signing')} />
  if (state.phase === 'pending')
    return (
      <Alert tone="info" title={t('tx.pending')}>
        {t('tx.pendingBody')} {link}
      </Alert>
    )
  if (state.phase === 'confirmed')
    return (
      <Alert tone="success" title={t('tx.confirmed')}>
        {link}
      </Alert>
    )
  if (state.phase === 'rejected') return <Alert tone="warn" title={t('tx.rejected')}>{t('tx.rejectedBody')}</Alert>
  return (
    <Alert tone="error" title={t('tx.failed')}>
      {t(ERROR_KEYS[state.error ?? 'unknown'] ?? 'tx.error.unknown')} {link}
    </Alert>
  )
}
