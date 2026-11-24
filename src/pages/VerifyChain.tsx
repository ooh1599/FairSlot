import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { decodeEventLog, isHex, type Hex } from 'viem'
import { fairSlotAbi } from '@shared/fairslotAbi'
import { useI18n } from '@/i18n'
import { useManifest, useOnchainEvent, type PublicEventRow } from '@/hooks/data'
import { APP_CHAIN_ID, FAIRSLOT_ADDRESS } from '@/lib/env'
import { readClient } from '@/lib/chain'
import { shortHash } from '@/lib/time'
import { Alert, PageLoading } from '@/components/ui'
import { VerifyView } from '@/pages/Verify'

const HASH = /^0x[0-9a-fA-F]{64}$/

/** Finds the onchain event ID inside a FairSlot lock transaction. Returns null when the transaction holds no such event. */
async function eventIdFromTx(hash: Hex): Promise<Hex | null> {
  const receipt = await readClient.getTransactionReceipt({ hash })
  if (receipt.status !== 'success') return null
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== FAIRSLOT_ADDRESS?.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({ abi: fairSlotAbi, data: log.data, topics: log.topics })
      if (decoded.eventName === 'EventCommitted') return decoded.args.eventId
    } catch {
      // another event from the same contract; keep looking
    }
  }
  return null
}

/** Entry form: accepts either a lock transaction hash or the onchain event ID. */
export function VerifyLookup() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = value.trim()
    if (!HASH.test(v) || !isHex(v)) return setError(t('vc.invalid'))
    setError(null)
    setBusy(true)
    try {
      // An event ID resolves straight to the verify page; anything else is treated as a transaction hash.
      const asEvent = await readClient.readContract({ address: FAIRSLOT_ADDRESS as Hex, abi: fairSlotAbi, functionName: 'getEvent', args: [v] }).catch(() => null)
      if (asEvent && asEvent.state !== 0) return void navigate(`/verify/${v}`)
      const id = await eventIdFromTx(v).catch(() => null)
      if (id) return void navigate(`/verify/${id}`)
      setError(t('vc.notFoundTx'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">{t('vc.eyebrow')}</p>
        <h1 className="text-3xl font-bold sm:text-4xl">{t('vc.title')}</h1>
        <p className="text-navy-600 text-pretty">{t('vc.intro')}</p>
      </header>
      {!FAIRSLOT_ADDRESS ? (
        <Alert tone="warn">{t('vc.contractMissing')}</Alert>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="card space-y-3">
          <label htmlFor="vc-input" className="label">{t('vc.label')}</label>
          <div className="flex gap-2">
            <input id="vc-input" className="input mono" placeholder="0x…" value={value} onChange={(e) => { setValue(e.target.value); setError(null) }} spellCheck={false} autoComplete="off" />
            <button className="btn-teal shrink-0" disabled={busy}>
              <Search className="h-4 w-4" aria-hidden />
              {busy ? t('vc.checking') : t('vc.go')}
            </button>
          </div>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <p className="text-xs text-navy-500">{t('vc.usingContract', { address: shortHash(FAIRSLOT_ADDRESS, 8, 6) })}</p>
        </form>
      )}
    </div>
  )
}

/** Verify page built from the chain alone: the onchain commitment plus the file it points to. */
export default function VerifyChain() {
  const { eventId } = useParams()
  const { t } = useI18n()
  const valid = eventId && HASH.test(eventId) ? (eventId as Hex) : null
  const chain = useOnchainEvent(valid)
  const manifest = useManifest(chain.data?.manifestURI, chain.data?.manifestHash)

  if (!valid) return <Alert tone="error">{t('vc.invalid')}</Alert>
  if (chain.isLoading) return <PageLoading label={t('vc.checking')} />
  const c = chain.data
  if (!c || c.state === 0) return <Alert tone="error">{t('vc.notFoundEvent')}</Alert>

  const m = manifest.data?.state === 'ok' ? manifest.data.manifest : null
  const row: PublicEventRow = {
    public_id: m?.eventPublicId ?? valid,
    title: m?.title ?? shortHash(valid, 10, 8),
    description: m?.description ?? '',
    rules: m?.rules ?? '',
    prizes: m?.prizes ?? [],
    winner_count: c.winnerCount,
    reserve_count: c.reserveCount,
    draw_not_before: new Date(Number(c.drawNotBefore) * 1000).toISOString(),
    status: 'committed',
    chain_id: APP_CHAIN_ID,
    contract_address: FAIRSLOT_ADDRESS ?? null,
    organizer_wallet: c.organizer,
    manifest_hash: c.manifestHash,
    manifest_uri: c.manifestURI,
    commit_tx_hash: null,
    onchain_event_id: valid,
    locked_at: null,
    committed_at: new Date(Number(c.committedAt) * 1000).toISOString(),
  }
  return (
    <div className="space-y-4">
      <VerifyView event={row} chain={chain} manifest={manifest} manifestUri={c.manifestURI} manifestHash={c.manifestHash} delivery={{ data: undefined }} />
      <p className="mx-auto max-w-4xl text-xs text-navy-500 text-pretty">{t('vc.noDatabase')}</p>
    </div>
  )
}
