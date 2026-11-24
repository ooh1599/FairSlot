import { useState } from 'react'
import type { Address } from 'viem'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Dices, Hourglass, RefreshCcw, Trophy, Wallet } from 'lucide-react'
import { coordinatorAbi } from '@d20dao/vrf-sdk/abi'
import { fairSlotAbi } from '@shared/fairslotAbi'
import { FAIRSLOT_CALLBACK_GAS, RECOVERY_GAS } from '@shared/chains'
import { LIMITS } from '@shared/limits'
import { useI18n } from '@/i18n'
import type { DbEvent } from '@/hooks/data'
import { coordinatorAddress, fetchRefundCredit, quoteDrawValue, type OnchainEvent } from '@/lib/chain'
import { FAIRSLOT_ADDRESS } from '@/lib/env'
import { formatNativeUsdc } from '@/lib/money'
import { formatBangkok } from '@/lib/time'
import { useContractTx } from '@/hooks/useTx'
import { Alert, Spinner } from './ui'
import { PhaseBadge, phaseExplanationKey } from './StatusBadge'
import { TxPanel } from './TxPanel'
import { WalletGate } from './WalletGate'

/** Everything the organizer (and anyone, for recovery) can do after the commitment is onchain. */
export function DrawPanel({ event, chain }: { event: DbEvent; chain: OnchainEvent }) {
  const { t, lang } = useI18n()
  const [understood, setUnderstood] = useState(false)
  const request = useContractTx()
  const finalize = useContractTx()
  const recover = useContractTx()
  const cancel = useContractTx()
  const withdraw = useContractTx()
  const phase = chain.phase
  const opensAt = Number(chain.drawNotBefore)
  const notYetOpen = Number(chain.chainNow) < opensAt

  const quote = useQuery({ queryKey: ['draw-quote'], queryFn: quoteDrawValue, enabled: phase === 'committed', refetchInterval: 15_000 })

  if (!FAIRSLOT_ADDRESS) return null
  const fairSlot: Address = FAIRSLOT_ADDRESS
  const total = chain.winnerCount + chain.reserveCount
  const batches = Math.ceil((total - chain.drawn) / LIMITS.finalizeBatch)

  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Dices className="h-6 w-6 text-teal-600" aria-hidden />
        <h2 className="text-xl font-semibold">{t('draw.title')}</h2>
        <PhaseBadge phase={phase} />
      </div>
      <p className="text-sm text-navy-700 text-pretty">{t(phaseExplanationKey(phase))}</p>

      <WalletGate requireVerified={false}>
        {(address) => {
          const isOrganizer = address.toLowerCase() === chain.organizer.toLowerCase()
          return (
            <div className="space-y-5">
              {phase === 'committed' && (
                <div className="space-y-4">
                  {notYetOpen ? (
                    <Alert tone="info" title={t('draw.notOpen')}>
                      {t('draw.opensAt', { time: formatBangkok(opensAt * 1000, lang) })}
                    </Alert>
                  ) : !isOrganizer ? (
                    <Alert tone="warn">{t('draw.onlyOrganizer')}</Alert>
                  ) : (
                    <div className="space-y-3 rounded-xl bg-navy-50 p-4">
                      <h3 className="font-semibold">{t('draw.feeTitle')}</h3>
                      {quote.isLoading && <Spinner label={t('draw.quoting')} />}
                      {quote.isError && <Alert tone="error">{t('draw.quoteFailed')}</Alert>}
                      {quote.data && (
                        <dl className="grid gap-1 text-sm sm:grid-cols-2">
                          <dt className="text-navy-600">{t('draw.fee')}</dt>
                          <dd className="font-semibold tabular-nums">{formatNativeUsdc(quote.data.fee)} USDC</dd>
                          <dt className="text-navy-600">{t('draw.feeSend')}</dt>
                          <dd className="tabular-nums">{formatNativeUsdc(quote.data.value)} USDC</dd>
                        </dl>
                      )}
                      <p className="text-xs text-navy-600">{t('draw.feeNote')}</p>
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1 h-4 w-4" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                        {t('draw.understood')}
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="btn-teal"
                          disabled={!understood || !quote.data || request.state.phase === 'signing' || request.state.phase === 'pending'}
                          onClick={() => quote.data && void request.send({ address: fairSlot, abi: fairSlotAbi, functionName: 'requestDraw', args: [chain.eventId], value: quote.data.value })}
                        >
                          {t('draw.request')}
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          disabled={cancel.state.phase === 'signing' || cancel.state.phase === 'pending'}
                          onClick={() => window.confirm(t('draw.confirmCancel')) && void cancel.send({ address: fairSlot, abi: fairSlotAbi, functionName: 'cancelEvent', args: [chain.eventId] })}
                        >
                          {t('draw.cancel')}
                        </button>
                      </div>
                      <TxPanel state={request.state} />
                      <TxPanel state={cancel.state} />
                    </div>
                  )}
                </div>
              )}

              {phase === 'requested-pending' && (
                <Alert tone="info" title={t('draw.waitingTitle')}>
                  <p className="flex items-center gap-2">
                    <Hourglass className="h-4 w-4" aria-hidden />
                    {chain.request ? t('draw.deadline', { time: formatBangkok(Number(chain.request.deadline) * 1000, lang) }) : ''}
                  </p>
                  <p>{t('draw.waitingBody')}</p>
                </Alert>
              )}

              {phase === 'requested-expired' && (
                <div className="space-y-3">
                  <Alert tone="error" title={t('draw.expiredTitle')}>
                    {t('draw.expiredBody')}
                  </Alert>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={recover.state.phase === 'signing' || recover.state.phase === 'pending'}
                      onClick={() => void recover.send({ address: coordinatorAddress, abi: coordinatorAbi, functionName: 'refundRequest', args: [chain.requestId], gas: RECOVERY_GAS.refundRequest })}
                    >
                      {t('draw.refund')}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={recover.state.phase === 'signing' || recover.state.phase === 'pending'}
                      onClick={() => void recover.send({ address: fairSlot, abi: fairSlotAbi, functionName: 'markFailed', args: [chain.eventId] })}
                    >
                      {t('draw.markFailed')}
                    </button>
                  </div>
                  <TxPanel state={recover.state} />
                </div>
              )}

              {phase === 'callback-failed' && (
                <div className="space-y-3">
                  <Alert tone="warn" title={t('draw.callbackTitle')}>
                    {t('draw.callbackBody')}
                  </Alert>
                  <button
                    type="button"
                    className="btn-teal"
                    disabled={recover.state.phase === 'signing' || recover.state.phase === 'pending'}
                    onClick={() =>
                      void recover.send({
                        address: coordinatorAddress,
                        abi: coordinatorAbi,
                        functionName: 'retryCallback',
                        args: [chain.requestId, FAIRSLOT_CALLBACK_GAS + 150_000],
                        gas: BigInt(FAIRSLOT_CALLBACK_GAS + 150_000) + RECOVERY_GAS.retryCallbackExtra,
                      })
                    }
                  >
                    <RefreshCcw className="h-4 w-4" aria-hidden />
                    {t('draw.retry')}
                  </button>
                  <TxPanel state={recover.state} />
                </div>
              )}

              {(phase === 'received' || phase === 'finalizing') && (
                <div className="space-y-3">
                  <Alert tone="success" title={t('draw.receivedTitle')}>
                    {t('draw.receivedBody', { done: chain.drawn, total, batches })}
                  </Alert>
                  <button
                    type="button"
                    className="btn-teal"
                    disabled={finalize.state.phase === 'signing' || finalize.state.phase === 'pending'}
                    onClick={() => void finalize.send({ address: fairSlot, abi: fairSlotAbi, functionName: 'finalize', args: [chain.eventId, LIMITS.finalizeBatch] })}
                  >
                    <Trophy className="h-4 w-4" aria-hidden />
                    {t('draw.finalize')}
                  </button>
                  <TxPanel state={finalize.state} />
                </div>
              )}

              {phase === 'finalized' && (
                <div className="flex flex-wrap gap-3">
                  <Link className="btn-primary" to={`/events/${event.public_id}`}>{t('draw.viewResults')}</Link>
                  <Link className="btn-ghost" to={`/events/${event.public_id}/live`} target="_blank" rel="noopener noreferrer">{t('draw.openLive')}</Link>
                  <Link className="btn-ghost" to={`/events/${event.public_id}/verify`}>{t('draw.verify')}</Link>
                </div>
              )}

              <RefundCredit address={address} withdraw={withdraw} />
            </div>
          )
        }}
      </WalletGate>
    </section>
  )
}

function RefundCredit({ address, withdraw }: { address: `0x${string}`; withdraw: ReturnType<typeof useContractTx> }) {
  const { t } = useI18n()
  const credit = useQuery({ queryKey: ['refund-credit', address], queryFn: () => fetchRefundCredit(address), refetchInterval: 20_000 })
  if (!credit.data || credit.data === 0n) return null
  return (
    <div className="space-y-2 rounded-xl border border-gold-300 bg-gold-100/60 p-4">
      <p className="text-sm font-medium">
        <Wallet className="mr-1 inline h-4 w-4" aria-hidden />
        {t('draw.creditTitle', { amount: formatNativeUsdc(credit.data) })}
      </p>
      <p className="text-xs text-navy-700">{t('draw.creditBody')}</p>
      <button
        type="button"
        className="btn-primary"
        disabled={withdraw.state.phase === 'signing' || withdraw.state.phase === 'pending'}
        onClick={() => void withdraw.send({ address: coordinatorAddress, abi: coordinatorAbi, functionName: 'withdrawRefundCredit', args: [address] })}
      >
        {t('draw.creditWithdraw')}
      </button>
      <TxPanel state={withdraw.state} />
    </div>
  )
}
