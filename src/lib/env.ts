import { isAddress, type Address } from 'viem'
import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from '@shared/limits'

const rawChain = Number(import.meta.env.VITE_CHAIN_ID ?? ARC_MAINNET_CHAIN_ID)
const rawAddress = import.meta.env.VITE_FAIRSLOT_ADDRESS?.trim()

export const APP_CHAIN_ID: number =
  rawChain === ARC_TESTNET_CHAIN_ID ? ARC_TESTNET_CHAIN_ID : ARC_MAINNET_CHAIN_ID

/** Undefined until a FairSlot contract is deployed and its address is set. Committing is disabled meanwhile. */
export const FAIRSLOT_ADDRESS: Address | undefined =
  rawAddress && isAddress(rawAddress) ? (rawAddress.toLowerCase() as Address) : undefined

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || undefined
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined
export const BACKEND_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
export const IS_TESTNET = APP_CHAIN_ID === ARC_TESTNET_CHAIN_ID
