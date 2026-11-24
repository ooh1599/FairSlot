import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileCheck2, Lock } from 'lucide-react'
import type { Address, Hex } from 'viem'
import { fairSlotAbi } from '@shared/fairslotAbi'
import { useI18n } from '@/i18n'
import type { DbEvent } from '@/hooks/data'
import { ApiError, apiPost } from '@/lib/supabase'
import { FAIRSLOT_ADDRESS } from '@/lib/env'
import { shortHash } from '@/lib/time'
import { useContractTx } from '@/hooks/useTx'
import { Alert, CopyButton, Mono, Spinner } from './ui'
import { TxPanel } from './TxPanel'
import { WalletGate } from './WalletGate'

interface PublishResult {
  manifestHash: Hex
  manifestUri: string
  publicEventIdBytes32: Hex
  drawNotBefore: number
  participantCount: number
  winnerCount: number
  reserveCount: number
  algorithmVersion: number
  organizerWallet: Address
}

const storageKey = (eventId: string) => `fairslot.commitTx.${eventId}`

/** Steps "lock and publish": verify wallet, publish the manifest, commit it onchain, then record the confirmed commit. */
export function LockStep({ event }: { event: DbEvent }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [published, setPublished] = useState<PublishResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const refreshEvent = async () => {
    await queryClient.invalidateQueries({ queryKey: ['my-event', event.public_id] })
    await queryClient.invalidateQueries({ queryKey: ['my-events'] })
  }

  const confirmCommit = async (hash: Hex) => {
    setSyncing(true)
    setError(null)
    try {
      await apiPost('/api/events?step=confirm', { eventId: event.id, txHash: hash })
      localStorage.removeItem(storageKey(event.id))
      await refreshEvent()
    } catch {
      setError(t('lock.confirmFailed'))
    } finally {
      setSyncing(false)
    }
  }

  const { state: tx, send, reset } = useContractTx(confirmCommit)

  useEffect(() => {
    if (tx.hash && (tx.phase === 'pending' || tx.phase === 'confirmed')) {
      try {
        localStorage.setItem(storageKey(event.id), tx.hash)
      } catch {
        /* storage unavailable */
      }
    }
  }, [tx.hash, tx.phase, event.id])

  const savedHash = (() => {
    try {
      return localStorage.getItem(storageKey(event.id)) as Hex | null
    } catch {
      return null
    }
  })()

  const publish = async (wallet: Address) => {
    setBusy(true)
    setError(null)
    try {
      const result = await apiPost<PublishResult>('/api/events?step=publish', { eventId: event.id, wallet })
      setPublished(result)
      await refreshEvent()
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'unknown'
      setError(code === 'contract-not-configured' ? t('lock.contractMissing') : code === 'not-enough-entries' ? t('lock.notEnough') : t('lock.publishFailed'))
    } finally {
      setBusy(false)
    }
  }

  const commit = (p: PublishResult) => {
    if (!FAIRSLOT_ADDRESS) return
    void send({
      address: FAIRSLOT_ADDRESS,
      abi: fairSlotAbi,
      functionName: 'commitEvent',
      args: [p.publicEventIdBytes32, p.manifestHash, p.manifestUri, p.participantCount, p.winnerCount, p.reserveCount, p.algorithmVersion, BigInt(p.drawNotBefore), p.organizerWallet],
    })
  }

  if (!FAIRSLOT_ADDRESS) {
    return (
      <div className="card space-y-3">
        <Alert tone="warn" title={t('lock.contractMissingTitle')}>
          {t('lock.contractMissing')}
        </Alert>
      </div>
    )
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-gold-400">
          <Lock className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-xl font-semibold">{t('lock.title')}</h2>
          <p className="text-sm text-navy-600">{t('lock.body')}</p>
        </div>
      </div>

      <ol className="space-y-5">
        <li className="space-y-2">
          <h3 className="font-semibold">{t('lock.step1')}</h3>
          <WalletGate>
            {(address) => (
              <div className="space-y-4">
                <p className="text-sm text-teal-700">
                  <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden />
                  {t('lock.walletReady', { address: shortHash(address, 6, 4) })}
                </p>

                <div className="space-y-2">
                  <h3 className="font-semibold">{t('lock.step2')}</h3>
                  {event.status === 'locked' && event.manifest_hash && !published ? (
                    <Alert tone="info">{t('lock.alreadyPublished')}</Alert>
                  ) : null}
                  <button type="button" className="btn-primary" disabled={busy} onClick={() => void publish(address)}>
                    {busy ? <Spinner /> : <FileCheck2 className="h-4 w-4" aria-hidden />}
                    {event.status === 'locked' ? t('lock.republish') : t('lock.publish')}
                  </button>
                </div>

                {published && (
                  <div className="space-y-3">
                    <Alert tone="success" title={t('lock.published')}>
                      <p>
                        {t('lock.manifestHash')}: <Mono>{published.manifestHash}</Mono> <CopyButton value={published.manifestHash} />
                      </p>
                      <p className="text-xs">{t('lock.hashNote')}</p>
                    </Alert>
                    <h3 className="font-semibold">{t('lock.step3')}</h3>
                    <p className="text-sm text-navy-600">{t('lock.commitBody')}</p>
                    <button
                      type="button"
                      className="btn-teal"
                      disabled={tx.phase === 'signing' || tx.phase === 'pending' || syncing}
                      onClick={() => {
                        reset()
                        // A different account than the one that published would commit under another organizer.
                        if (address.toLowerCase() !== published.organizerWallet.toLowerCase()) {
                          setError(t('lock.walletChanged', { address: shortHash(published.organizerWallet, 6, 4) }))
                          return
                        }
                        setError(null)
                        commit(published)
                      }}
                    >
                      {t('lock.commit')}
                    </button>
                  </div>
                )}
                <TxPanel state={tx} />
                {syncing && <Spinner label={t('lock.syncing')} />}
                {savedHash && tx.phase === 'idle' && event.status === 'locked' && (
                  <Alert tone="info" title={t('lock.resumeTitle')}>
                    <p>{t('lock.resumeBody')}</p>
                    <button type="button" className="btn-ghost mt-2" onClick={() => void confirmCommit(savedHash)}>
                      {t('lock.resumeCta')}
                    </button>
                  </Alert>
                )}
              </div>
            )}
          </WalletGate>
        </li>
      </ol>
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-xs text-navy-500">
        {t('lock.nextHint')} <Link className="underline" to={`/events/${event.public_id}`}>{t('lock.publicPage')}</Link>
      </p>
    </div>
  )
}
