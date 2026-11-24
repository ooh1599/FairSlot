import { createPublicClient, http, type Address, type Hex } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { coordinatorAbi } from '@d20dao/vrf-sdk/abi'
import { D20_COORDINATOR, FEE_BUFFER_BPS } from '@shared/chains'
import { fairSlotAbi } from '@shared/fairslotAbi'
import { ARC_TESTNET_CHAIN_ID } from '@shared/limits'
import { requireChain } from '@/onchain-facts'
import { APP_CHAIN_ID, FAIRSLOT_ADDRESS } from './env'

export const appChain = APP_CHAIN_ID === ARC_TESTNET_CHAIN_ID ? arcTestnet : arc
export const coordinatorAddress: Address = D20_COORDINATOR[APP_CHAIN_ID]
export const explorerBase = requireChain(APP_CHAIN_ID).explorerBase

// Production reads go through the app's own /api/rpc relay unless the host has no serverless functions (VITE_RPC_MODE=direct).
const useRelay = import.meta.env.PROD && import.meta.env.VITE_RPC_MODE !== 'direct'
const rpcUrl = useRelay ? `/api/rpc?chain=${APP_CHAIN_ID}` : appChain.rpcUrls.default.http[0]
export const readClient = createPublicClient({ chain: appChain, transport: http(rpcUrl, { retryCount: 2, timeout: 15_000 }) })

export const txUrl = (hash: string) => `${explorerBase}/tx/${hash}`
export const addressUrl = (address: string) => `${explorerBase}/address/${address}`

export type Phase =
  | 'not-committed'
  | 'committed'
  | 'cancelled'
  | 'requested-pending'
  | 'requested-expired'
  | 'callback-failed'
  | 'received'
  | 'finalizing'
  | 'finalized'
  | 'failed'

export const STATE_NAMES = [
  'NONE',
  'COMMITTED',
  'RANDOMNESS_REQUESTED',
  'RANDOMNESS_RECEIVED',
  'FINALIZING',
  'FINALIZED',
  'CANCELLED',
  'FAILED',
] as const

export interface CoordinatorRequest {
  consumer: Address
  deadline: bigint
  refundAddress: Address
  clientSeed: Hex
  randomness: Hex
  proofHash: Hex
  transcriptHash: Hex
  fulfilled: boolean
  delivered: boolean
  refunded: boolean
}

export interface OnchainEvent {
  eventId: Hex
  state: number
  organizer: Address
  winnerCount: number
  reserveCount: number
  participantCount: number
  drawn: number
  algorithmVersion: number
  committedAt: bigint
  drawNotBefore: bigint
  requestedAt: bigint
  refundRecipient: Address
  publicEventId: Hex
  manifestHash: Hex
  requestId: bigint
  randomWord: Hex
  manifestURI: string
  winners: number[]
  request: CoordinatorRequest | null
  /** timestamp of the latest block, used for expiry checks (never the browser clock) */
  chainNow: bigint
  phase: Phase
}

export function derivePhase(state: number, request: CoordinatorRequest | null, chainNow: bigint): Phase {
  switch (state) {
    case 0:
      return 'not-committed'
    case 1:
      return 'committed'
    case 2:
      if (request?.fulfilled) return request.delivered ? 'received' : 'callback-failed'
      if (request && (request.refunded || chainNow > request.deadline)) return 'requested-expired'
      return 'requested-pending'
    case 3:
      return 'received'
    case 4:
      return 'finalizing'
    case 5:
      return 'finalized'
    case 6:
      return 'cancelled'
    default:
      return 'failed'
  }
}

export const isTerminalPhase = (p: Phase) => p === 'finalized' || p === 'cancelled' || p === 'failed'

export async function fetchOnchainEvent(eventId: Hex): Promise<OnchainEvent | null> {
  if (!FAIRSLOT_ADDRESS) return null
  const [e, uri, winners, block] = await Promise.all([
    readClient.readContract({ address: FAIRSLOT_ADDRESS, abi: fairSlotAbi, functionName: 'getEvent', args: [eventId] }),
    readClient.readContract({ address: FAIRSLOT_ADDRESS, abi: fairSlotAbi, functionName: 'manifestURI', args: [eventId] }),
    readClient.readContract({ address: FAIRSLOT_ADDRESS, abi: fairSlotAbi, functionName: 'getWinners', args: [eventId] }),
    readClient.getBlock(),
  ])
  if (e.state === 0) return null
  let request: CoordinatorRequest | null = null
  if (e.requestId !== 0n) {
    const r = await readClient.readContract({
      address: coordinatorAddress,
      abi: coordinatorAbi,
      functionName: 'getRequest',
      args: [e.requestId],
    })
    request = {
      consumer: r.consumer,
      deadline: BigInt(r.deadline),
      refundAddress: r.refundAddress,
      clientSeed: r.clientSeed,
      randomness: r.randomness,
      proofHash: r.proofHash,
      transcriptHash: r.transcriptHash,
      fulfilled: r.fulfilled,
      delivered: r.delivered,
      refunded: r.refunded,
    }
  }
  return {
    eventId,
    state: e.state,
    organizer: e.organizer,
    winnerCount: e.winnerCount,
    reserveCount: e.reserveCount,
    participantCount: e.participantCount,
    drawn: e.drawn,
    algorithmVersion: e.algorithmVersion,
    committedAt: e.committedAt,
    drawNotBefore: e.drawNotBefore,
    requestedAt: e.requestedAt,
    refundRecipient: e.refundRecipient,
    publicEventId: e.publicEventId,
    manifestHash: e.manifestHash,
    requestId: e.requestId,
    randomWord: e.randomWord,
    manifestURI: uri,
    winners: winners.map(Number),
    request,
    chainNow: block.timestamp,
    phase: derivePhase(e.state, request, block.timestamp),
  }
}

/** Fee for a requestDraw sent now: quoted at the latest base fee plus a buffer. The contract returns any unspent value. */
export async function quoteDrawValue(): Promise<{ fee: bigint; value: bigint }> {
  if (!FAIRSLOT_ADDRESS) throw new Error('contract-not-configured')
  const block = await readClient.getBlock()
  const base = block.baseFeePerGas ?? 0n
  const [fee, buffered] = await Promise.all([
    readClient.readContract({ address: FAIRSLOT_ADDRESS, abi: fairSlotAbi, functionName: 'quoteFeeAt', args: [base] }),
    readClient.readContract({
      address: FAIRSLOT_ADDRESS,
      abi: fairSlotAbi,
      functionName: 'quoteFeeAt',
      args: [(base * (10_000n + FEE_BUFFER_BPS)) / 10_000n],
    }),
  ])
  return { fee, value: buffered }
}

export async function fetchRefundCredit(account: Address): Promise<bigint> {
  return readClient.readContract({
    address: coordinatorAddress,
    abi: coordinatorAbi,
    functionName: 'refundCredits',
    args: [account],
  })
}

/** Only https links are ever fetched or rendered as links; an onchain manifest URI is organizer-controlled input. */
export function safeHttpsUrl(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

/**
 * Delivery rows are the organizer's own statements. Only rows that name the person actually drawn at that rank
 * (by the onchain result) are shown, so a stray row can never decorate someone who did not win.
 */
export function deliveryForWinners<T extends { public_entry_id: string; rank: number }>(
  rows: readonly T[],
  winners: readonly number[],
  manifestEntries: readonly string[],
): T[] {
  return rows.filter((r) => {
    const index = winners[r.rank - 1]
    return index !== undefined && manifestEntries[index] === r.public_entry_id
  })
}
