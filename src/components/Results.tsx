import { Crown } from 'lucide-react'
import type { Manifest } from '@shared/manifest'
import { useI18n } from '@/i18n'
import { Badge, Mono } from './ui'

/** Winners from the confirmed onchain result, mapped to the pseudonymous public entry IDs of the manifest. */
export function ResultsList({ manifest, winners, winnerCount, delivery }: { manifest: Manifest; winners: number[]; winnerCount: number; delivery?: Map<string, string> }) {
  const { t } = useI18n()
  return (
    <ol className="space-y-2">
      {winners.map((index, i) => {
        const isReserve = i >= winnerCount
        const id = manifest.entries[index] ?? '?'
        const prize = !isReserve ? manifest.prizes[i]?.name : undefined
        return (
          <li
            key={i}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 ${isReserve ? 'border-navy-100 bg-white/70' : 'border-gold-300 bg-gold-100/60'}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              {!isReserve && <Crown className="h-4 w-4 text-gold-500" aria-hidden />}
              <Badge tone={isReserve ? 'neutral' : 'gold'}>{isReserve ? t('results.reserveN', { n: i - winnerCount + 1 }) : t('results.winnerN', { n: i + 1 })}</Badge>
              <Mono>{id}</Mono>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {prize && <span className="font-medium">{prize}</span>}
              {delivery?.get(id) && <Badge tone="info">{delivery.get(id)}</Badge>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
