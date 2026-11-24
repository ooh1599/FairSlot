import type { Address } from 'viem'
import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from './limits.js'

/**
 * Source: https://d20dao.org/docs/deployments and https://d20dao.org/deployments/arc-*.json,
 * cross-checked against the chain on 2026-11-02 (see docs/verified-integrations.md).
 * These are the proxy addresses a consumer connects to. They are passed to the FairSlot constructor.
 */
export const D20_COORDINATOR: Record<number, Address> = {
  [ARC_MAINNET_CHAIN_ID]: '0xd20da057469C45928912d983F45790C41e290571',
  [ARC_TESTNET_CHAIN_ID]: '0xd20DA0FF9087d053f0291524Eac12abA1ADBd945',
}

export const D20_EXPLORER: Record<number, string> = {
  [ARC_MAINNET_CHAIN_ID]: 'https://arc.d20dao.org',
  [ARC_TESTNET_CHAIN_ID]: 'https://arc-testnet.d20dao.org',
}

/** Gas limits D20DAO recommends for recovery transactions (docs/integration, SDK AGENTS.md). */
export const RECOVERY_GAS = {
  refundRequest: 400_000n,
  retryCallbackExtra: 250_000n,
} as const

/** Must equal FairSlot.CALLBACK_GAS. */
export const FAIRSLOT_CALLBACK_GAS = 150_000

/** Buffer added to the base-fee quote in the browser; the contract returns all unspent value in the same transaction. */
export const FEE_BUFFER_BPS = 3000n

export function isSupportedChain(chainId: number): boolean {
  return chainId in D20_COORDINATOR
}
