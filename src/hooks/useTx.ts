import { useCallback, useState } from 'react'
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { BaseError, type Abi, type Address, type Hex } from 'viem'
import { readClient } from '@/lib/chain'
import { APP_CHAIN_ID } from '@/lib/env'

export type TxPhase = 'idle' | 'signing' | 'pending' | 'confirmed' | 'failed' | 'rejected'

export interface TxState {
  phase: TxPhase
  hash?: Hex
  error?: string
}

export function describeError(error: unknown): { rejected: boolean; message: string } {
  const text = error instanceof BaseError ? `${error.shortMessage} ${error.details ?? ''}` : String(error)
  const lower = text.toLowerCase()
  if (error instanceof Error && error.name.includes('Timeout')) return { rejected: false, message: 'timeout' }
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) {
    return { rejected: true, message: 'rejected' }
  }
  if (lower.includes('insufficient funds') || lower.includes('exceeds the balance')) return { rejected: false, message: 'insufficient-funds' }
  if (lower.includes('drawnotopenyet')) return { rejected: false, message: 'draw-not-open' }
  if (lower.includes('insufficientfee')) return { rejected: false, message: 'fee-changed' }
  if (lower.includes('wrongstate')) return { rejected: false, message: 'wrong-state' }
  if (lower.includes('reverted')) return { rejected: false, message: 'reverted' }
  return { rejected: false, message: 'unknown' }
}

interface WriteArgs {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
  value?: bigint
  gas?: bigint
}

/**
 * One contract write with honest state: signing, pending (with hash), confirmed or failed.
 * A rejected signature returns to a state the user can retry from.
 */
export function useContractTx(onConfirmed?: (hash: Hex) => void | Promise<void>) {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()
  const [state, setState] = useState<TxState>({ phase: 'idle' })

  const send = useCallback(
    async (write: WriteArgs) => {
      setState({ phase: 'signing' })
      try {
        if (chainId !== APP_CHAIN_ID) await switchChainAsync({ chainId: APP_CHAIN_ID })
        const hash = await writeContractAsync({
          address: write.address,
          abi: write.abi,
          functionName: write.functionName,
          args: write.args,
          value: write.value,
          gas: write.gas,
          chainId: APP_CHAIN_ID,
        })
        setState({ phase: 'pending', hash })
        const receipt = await readClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
        if (receipt.status !== 'success') {
          setState({ phase: 'failed', hash, error: 'reverted' })
          return
        }
        setState({ phase: 'confirmed', hash })
        await queryClient.invalidateQueries()
        await onConfirmed?.(hash)
      } catch (error) {
        const info = describeError(error)
        setState((prev) => (info.rejected ? { phase: 'rejected' } : { phase: 'failed', hash: prev.hash, error: info.message }))
      }
    },
    [chainId, onConfirmed, queryClient, switchChainAsync, writeContractAsync],
  )

  const reset = useCallback(() => setState({ phase: 'idle' }), [])
  return { state, send, reset }
}
