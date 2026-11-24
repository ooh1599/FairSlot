import { formatUnitsFixed, gasTokenDecimalsFor } from '@/onchain-money'
import { APP_CHAIN_ID } from './env'

/**
 * Fees on Arc are paid in the native gas view of USDC (18 decimals). This is the same money as ERC-20 USDC,
 * so it is shown once, as USDC, never added to an ERC-20 balance.
 */
export function formatNativeUsdc(raw: bigint, fractionDigits = 4): string {
  return formatUnitsFixed(raw, gasTokenDecimalsFor(APP_CHAIN_ID), fractionDigits)
}
