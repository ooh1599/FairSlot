import { ExternalLink, LogOut } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { useWallets } from '@/hooks/data'
import { FAIRSLOT_ADDRESS, APP_CHAIN_ID } from '@/lib/env'
import { addressUrl, appChain, coordinatorAddress } from '@/lib/chain'
import { formatBangkok, shortHash } from '@/lib/time'
import { Alert, Mono, SectionTitle } from '@/components/ui'
import { WalletGate } from '@/components/WalletGate'

export default function Settings() {
  const { t, lang, setLang } = useI18n()
  const { user, signOut } = useAuth()
  const wallets = useWallets()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionTitle eyebrow={t('settings.eyebrow')} title={t('settings.title')} />

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">{t('settings.account')}</h2>
        <p className="text-sm">{user?.email}</p>
        <button type="button" className="btn-ghost" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" aria-hidden />
          {t('settings.signOut')}
        </button>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">{t('settings.language')}</h2>
        <div className="flex gap-2" role="group" aria-label={t('settings.language')}>
          {(['th', 'en'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? 'btn-primary' : 'btn-ghost'} onClick={() => setLang(l)}>
              {l === 'th' ? 'ไทย' : 'English (US)'}
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t('settings.wallets')}</h2>
        <p className="text-sm text-navy-600">{t('settings.walletsBody')}</p>
        {wallets.data && wallets.data.length === 0 && <p className="text-sm text-navy-500">{t('settings.noWallets')}</p>}
        <ul className="space-y-1 text-sm">
          {wallets.data?.map((w) => (
            <li key={w.address} className="flex flex-wrap items-center gap-2">
              <a className="inline-flex items-center gap-1 underline" href={addressUrl(w.address)} target="_blank" rel="noopener noreferrer">
                <span className="mono">{shortHash(w.address, 8, 6)}</span>
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              <span className="text-navy-500">{t('settings.verifiedAt', { time: formatBangkok(w.verified_at, lang) })}</span>
            </li>
          ))}
        </ul>
        <WalletGate>{(address) => <p className="text-sm text-teal-700">{t('settings.walletLinked', { address: shortHash(address, 6, 4) })}</p>}</WalletGate>
      </section>

      <section className="card space-y-2 text-sm">
        <h2 className="text-lg font-semibold">{t('settings.network')}</h2>
        <dl className="grid gap-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-navy-500">{t('settings.chain')}</dt>
          <dd>{appChain.name} ({APP_CHAIN_ID})</dd>
          <dt className="text-navy-500">{t('verify.contract')}</dt>
          <dd>{FAIRSLOT_ADDRESS ? <Mono>{FAIRSLOT_ADDRESS}</Mono> : <span className="text-red-700">{t('settings.contractMissing')}</span>}</dd>
          <dt className="text-navy-500">{t('settings.coordinator')}</dt>
          <dd><Mono>{coordinatorAddress}</Mono></dd>
        </dl>
        {!FAIRSLOT_ADDRESS && <Alert tone="warn">{t('lock.contractMissing')}</Alert>}
      </section>
    </div>
  )
}
