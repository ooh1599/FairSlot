import type { Address, Hex } from 'viem'
import { onchainEventId } from './draw.js'
import { eventIdToBytes32 } from './manifest.js'

/**
 * Fixed inputs for the golden test vectors. The Solidity test (contracts/test/FairSlot.t.sol) deploys
 * FairSlot at VECTOR_CONTRACT with chain id 5042 and replays exactly these inputs.
 */
export const VECTOR_CHAIN_ID = 5042n
export const VECTOR_CONTRACT: Address = '0x000000000000000000000000000000000000fa15'
export const VECTOR_ORGANIZER: Address = '0x00000000000000000000000000000000000abc01'
export const VECTOR_PUBLIC_EVENT_ID = 'fs_0123456789abcdefghjk'
export const VECTOR_MANIFEST_HASH: Hex = '0x1111111111111111111111111111111111111111111111111111111111111111'
export const VECTOR_FIRST_REQUEST_ID = 7n
export const VECTOR_WORD: Hex = '0x9f2b6c1d77a3e5408b0c4d9e1a6f3b2c85d7e0a14c9b3f6e2d8a5c7b1e4f9a03'

export const VECTOR_EVENT_ID: Hex = onchainEventId(
  VECTOR_CHAIN_ID,
  VECTOR_CONTRACT,
  VECTOR_ORGANIZER,
  eventIdToBytes32(VECTOR_PUBLIC_EVENT_ID),
)

export const VECTOR_CASES = [
  { name: 'small', participants: 100, winners: 5, reserves: 3 },
  { name: 'full-permutation', participants: 10, winners: 7, reserves: 3 },
  { name: 'max-picks', participants: 10_000, winners: 30, reserves: 20 },
  { name: 'single-entry', participants: 1, winners: 1, reserves: 0 },
] as const
