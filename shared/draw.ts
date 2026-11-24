import { encodeAbiParameters, keccak256, parseAbiParameters, type Address, type Hex } from 'viem'
import { ALGORITHM_VERSION, LIMITS } from './limits.js'

/**
 * TypeScript twin of FairSlot.sol (algorithm v1). Every step here matches the contract byte for byte:
 *
 *  base      = keccak256(abi.encode(DRAW_DOMAIN, chainId, contract, eventId, manifestHash, requestId, word, version))
 *  candidate = keccak256(abi.encode(base, uint32 position, uint32 counter))   (counter = rejection counter)
 *  accept candidate when candidate <= 2^256-1 - (2^256 mod range), value = candidate mod range
 *  partial Fisher-Yates with a sparse swap map: at position p pick j = p + uniform(n - p), output value[j],
 *  then value[j] := value[p]. A range of 1 consumes no hash and returns 0.
 */
export const DRAW_DOMAIN: Hex = keccak256(new TextEncoder().encode('FairSlot/draw/v1'))
export const SEED_DOMAIN: Hex = keccak256(new TextEncoder().encode('FairSlot/clientSeed/v1'))

const MAX_UINT256 = (1n << 256n) - 1n

export interface DrawInput {
  chainId: bigint
  contract: Address
  eventId: Hex
  manifestHash: Hex
  requestId: bigint
  randomWord: Hex
  participantCount: number
  winnerCount: number
  reserveCount: number
  algorithmVersion?: number
}

export function drawBase(input: Omit<DrawInput, 'participantCount' | 'winnerCount' | 'reserveCount'>): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, uint256, address, bytes32, bytes32, uint256, bytes32, uint8'),
      [
        DRAW_DOMAIN,
        input.chainId,
        input.contract,
        input.eventId,
        input.manifestHash,
        input.requestId,
        input.randomWord,
        input.algorithmVersion ?? ALGORITHM_VERSION,
      ],
    ),
  )
}

/** Hash function injection exists only so tests can force the rejection branch. */
export type CandidateHash = (base: Hex, position: number, counter: number) => bigint

export const candidateHash: CandidateHash = (base, position, counter) =>
  BigInt(keccak256(encodeAbiParameters(parseAbiParameters('bytes32, uint32, uint32'), [base, position, counter])))

export function uniform(base: Hex, position: number, range: number, hash: CandidateHash = candidateHash): bigint {
  if (range < 1) throw new RangeError('range must be >= 1')
  if (range === 1) return 0n
  const r = BigInt(range)
  const rem = ((MAX_UINT256 % r) + 1n) % r
  const limit = MAX_UINT256 - rem
  for (let counter = 0; ; counter++) {
    const h = hash(base, position, counter)
    if (h <= limit) return h % r
  }
}

/** Returns zero-based indices into the manifest entry list: main winners first, then reserves. */
export function computeWinners(input: DrawInput, hash: CandidateHash = candidateHash): number[] {
  const { participantCount: n, winnerCount, reserveCount } = input
  const total = winnerCount + reserveCount
  if (!Number.isInteger(n) || n < 1 || n > LIMITS.maxParticipants) throw new RangeError('participantCount out of range')
  if (winnerCount < 1 || total > LIMITS.maxPicks || total > n) throw new RangeError('winner/reserve counts out of range')

  const base = drawBase(input)
  const swaps = new Map<number, number>()
  const valueAt = (i: number) => swaps.get(i) ?? i
  const out: number[] = []
  for (let p = 0; p < total; p++) {
    const j = p + Number(uniform(base, p, n - p, hash))
    const vp = valueAt(p)
    const vj = valueAt(j)
    if (j !== p) swaps.set(j, vp)
    out.push(vj)
  }
  return out
}

/** The client seed FairSlot sends to the coordinator (it freezes the manifest into the request). */
export function clientSeed(chainId: bigint, contract: Address, eventId: Hex, manifestHash: Hex): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, uint256, address, bytes32, bytes32'), [
      SEED_DOMAIN,
      chainId,
      contract,
      eventId,
      manifestHash,
    ]),
  )
}

/** eventId = keccak256(abi.encode(chainId, contract, organizer, publicEventId)) */
export function onchainEventId(chainId: bigint, contract: Address, organizer: Address, publicEventId: Hex): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters('uint256, address, address, bytes32'), [
      chainId,
      contract,
      organizer,
      publicEventId,
    ]),
  )
}
