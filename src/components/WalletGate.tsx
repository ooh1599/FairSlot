import { useState, type ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { PlugZap, ShieldCheck, Wallet } from 'lucide-react'
import type { Address } from 'viem'
import { useI18n } from '@/i18n'
import { useWallets } from '@/hooks/data'
import { APP_CHAIN_ID } from '@/lib/env'
import { appChain } from '@/lib/chain'
import { apiPost } from '@/lib/supabase'
import { shortHash } from '@/lib/time'
import { describeError } from '@/hooks/useTx'
import { Alert, Spinner } from './ui'

export function ConnectButton({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnecting }) => (
        <button type="button" className="btn-primary" onClick={show} disabled={isConnecting}>
          <Wallet className="h-4 w-4" aria-hidden />
          {isConnecting ? t('wallet.connecting') : (label ?? t('wallet.connect'))}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

/**
 * Renders children only when a wallet is connected, on the right network, and proven to belong to the
 * signed-in organizer (signed nonce checked by the server).
 */
export function WalletGate({ children, requireVerified = true }: { children: (address: Address) => ReactNode; requireVerified?: boolean }) {
  const { t } = useI18n()
  const { address, isConnected, chainId } = useAccount()
  const { switchChainAsync, isPending: switching } = useSwitchChain()
  const { signMessageAsync } = useSignMessage()
  const wallets = useWallets()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isConnected || !address) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-navy-600">{t('wallet.needConnect')}</p>
        <ConnectButton />
      </div>
    )
  }

  if (chainId !== APP_CHAIN_ID) {
    return (
      <div className="space-y-3">
        <Alert tone="warn" title={t('wallet.wrongNetwork')}>
          {t('wallet.wrongNetworkBody', { chain: appChain.name })}
        </Alert>
        <button type="button" className="btn-primary" disabled={switching} onClick={() => void switchChainAsync({ chainId: APP_CHAIN_ID })}>
          <PlugZap className="h-4 w-4" aria-hidden />
          {t('wallet.switch', { chain: appChain.name })}
        </button>
      </div>
    )
  }

  const lower = address.toLowerCase()
  const linked = wallets.data?.some((w) => w.address.toLowerCase() === lower) ?? false

  if (requireVerified && wallets.isLoading) return <Spinner label={t('common.loading')} />

  if (requireVerified && !linked) {
    const verify = async () => {
      setBusy(true)
      setError(null)
      try {
        const { message, nonce } = await apiPost<{ message: string; nonce: string }>('/api/wallet?step=nonce', { address })
        const signature = await signMessageAsync({ message })
        await apiPost('/api/wallet?step=verify', { address, nonce, signature })
        await queryClient.invalidateQueries({ queryKey: ['wallets'] })
      } catch (e) {
        const info = describeError(e)
        setError(info.rejected ? t('tx.rejectedBody') : t('wallet.verifyFailed'))
      } finally {
        setBusy(false)
      }
    }
    return (
      <div className="space-y-3">
        <Alert tone="info" title={t('wallet.verifyTitle')}>
          {t('wallet.verifyBody', { address: shortHash(address, 6, 4) })}
        </Alert>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void verify()}>
          {busy ? <Spinner /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
          {t('wallet.verifyCta')}
        </button>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    )
  }

  return <>{children(address)}</>
}
