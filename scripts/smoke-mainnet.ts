/**
 * One small, real smoke event on Arc MAINNET with YOUR wallet, run from YOUR machine:
 * commit -> request randomness -> wait for the provider -> finalize -> recompute winners in TypeScript.
 *
 * THIS SPENDS REAL USDC (the randomness fee, about 0.03 USDC, plus gas). It cannot be undone.
 * Arc Studio never runs this for you; run it yourself after reading it.
 *
 *   SMOKE_PRIVATE_KEY=0x... CONFIRM_MAINNET=yes bun scripts/smoke-mainnet.ts
 *
 * Put the key in an environment variable in your own terminal. Never paste it into a chat or commit it.
 */
import { createPublicClient, createWalletClient, decodeEventLog, formatUnits, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arc } from 'viem/chains'
import { coordinatorAbi } from '@d20dao/vrf-sdk/abi'
import { fairSlotAbi } from '../shared/fairslotAbi.js'
import { D20_COORDINATOR, FEE_BUFFER_BPS, RECOVERY_GAS } from '../shared/chains.js'
import { computeWinners } from '../shared/draw.js'
import { generatePublicEntryId, generatePublicEventId } from '../shared/ids.js'
import { buildManifest, eventIdToBytes32, manifestHash } from '../shared/manifest.js'

const CHAIN_ID = 5042
const CONTRACT = (process.env.FAIRSLOT_MAINNET ?? '0x025985bA20a054150C0f7Fbb87E6704ee41E0Aee') as Address
const EXPLORER = 'https://explorer.arc.io'
const PARTICIPANTS = 5, WINNERS = 1, RESERVES = 1

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)

if (process.env.CONFIRM_MAINNET !== 'yes' || !process.env.SMOKE_PRIVATE_KEY) {
  console.log('Refusing to run. This sends real transactions on Arc Mainnet and spends real USDC.')
  console.log('Set SMOKE_PRIVATE_KEY (in your own terminal) and CONFIRM_MAINNET=yes to continue.')
  process.exit(1)
}
const account = privateKeyToAccount(process.env.SMOKE_PRIVATE_KEY as Hex)
const rpc = process.env.SMOKE_RPC_URL // optional: point at a local fork to dry-run this script without spending anything
const pub = createPublicClient({ chain: arc, transport: http(rpc) })
const wallet = createWalletClient({ account, chain: arc, transport: http(rpc) })

const balance = await pub.getBalance({ address: account.address })
log(`wallet ${account.address} balance ${formatUnits(balance, 18)} USDC (native view)`)
if (balance < 150_000_000_000_000_000n) {
  console.log(`Wallet ${account.address} needs at least 0.15 USDC on Arc Mainnet for the fee and gas.`)
  process.exit(2)
}

const send = async (label: string, args: object) => {
  const hash = await wallet.writeContract(args as never)
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 })
  log(`${label}: ${receipt.status} gas ${receipt.gasUsed} ${EXPLORER}/tx/${hash}`)
  if (receipt.status !== 'success') throw new Error(`${label} reverted`)
  return { hash, receipt }
}

// 1. Build and hash the manifest
const publicId = generatePublicEventId()
const drawNotBefore = Math.floor(Date.now() / 1000)
const manifest = buildManifest({
  eventPublicId: publicId,
  title: 'FairSlot mainnet smoke event',
  description: 'Small end-to-end smoke event.',
  rules: 'Smoke test only. No prizes.',
  organizerWallet: account.address.toLowerCase() as Address,
  chainId: CHAIN_ID,
  contractAddress: CONTRACT.toLowerCase() as Address,
  drawNotBeforeUtc: new Date(drawNotBefore * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  winnerCount: WINNERS,
  reserveCount: RESERVES,
  prizes: Array.from({ length: WINNERS }, (_, i) => ({ rank: i + 1, name: `Prize ${i + 1}` })),
  entryIds: Array.from({ length: PARTICIPANTS }, () => generatePublicEntryId()),
})
const mHash = manifestHash(manifest)
// The rehearsal does not host the file; the URI is a placeholder that satisfies the https rule.
const uri = `https://rehearsal.invalid/manifests/${mHash}.json`

// 2. Commit
const { receipt: commitReceipt } = await send('commit', {
  address: CONTRACT, abi: fairSlotAbi, functionName: 'commitEvent', account, chain: arc,
  args: [eventIdToBytes32(publicId), mHash, uri, PARTICIPANTS, WINNERS, RESERVES, 1, BigInt(drawNotBefore), account.address],
})
let eventId: Hex | null = null
for (const l of commitReceipt.logs) {
  try {
    const d = decodeEventLog({ abi: fairSlotAbi, data: l.data, topics: l.topics })
    if (d.eventName === 'EventCommitted') eventId = d.args.eventId
  } catch { /* other log */ }
}
if (!eventId) throw new Error('EventCommitted not found')
log(`eventId ${eventId}`)

// 3. Request randomness with a buffered quote
const block = await pub.getBlock()
const baseFee = block.baseFeePerGas ?? 0n
const quote = await pub.readContract({ address: CONTRACT, abi: fairSlotAbi, functionName: 'quoteFeeAt', args: [baseFee + (baseFee * FEE_BUFFER_BPS) / 10_000n] })
log(`fee quote ${formatUnits(quote, 18)} USDC`)
const balBefore = await pub.getBalance({ address: account.address })
const { receipt: reqReceipt } = await send('requestDraw', {
  address: CONTRACT, abi: fairSlotAbi, functionName: 'requestDraw', args: [eventId], value: quote, account, chain: arc,
})
const balAfter = await pub.getBalance({ address: account.address })
const gasCost = reqReceipt.gasUsed * reqReceipt.effectiveGasPrice
log(`spent beyond gas: ${formatUnits(balBefore - balAfter - gasCost, 18)} USDC (change was returned in the same transaction)`)

// 4. Wait for the provider; recover if the callback fails; stop at expiry
const coordinator = D20_COORDINATOR[CHAIN_ID]
let state = 2
const started = Date.now()
while (Date.now() - started < 5 * 60_000) {
  const e = await pub.readContract({ address: CONTRACT, abi: fairSlotAbi, functionName: 'getEvent', args: [eventId] })
  state = e.state
  const r = await pub.readContract({ address: coordinator, abi: coordinatorAbi, functionName: 'getRequest', args: [e.requestId] })
  const now = (await pub.getBlock()).timestamp
  log(`state ${state} fulfilled=${r.fulfilled} delivered=${r.delivered} refunded=${r.refunded} deadlineIn=${Number(r.deadline) - Number(now)}s`)
  if (state !== 2) break
  if (r.fulfilled && !r.delivered) {
    await send('retryCallback', { address: coordinator, abi: coordinatorAbi, functionName: 'retryCallback', args: [e.requestId, 300_000], gas: 300_000n + RECOVERY_GAS.retryCallbackExtra, account, chain: arc })
  } else if (!r.fulfilled && now > r.deadline) {
    log('request expired without an accepted proof: marking failed (no re-roll)')
    await send('markFailed', { address: CONTRACT, abi: fairSlotAbi, functionName: 'markFailed', args: [eventId], account, chain: arc })
    console.log('RESULT expired-failed')
    process.exit(3)
  }
  await sleep(5000)
}
if (state !== 3) throw new Error(`randomness not received, state ${state}`)

// 5. Finalize in bounded batches
for (let i = 0; i < 4; i++) {
  const e = await pub.readContract({ address: CONTRACT, abi: fairSlotAbi, functionName: 'getEvent', args: [eventId] })
  if (e.state === 5) break
  await send(`finalize #${i + 1}`, { address: CONTRACT, abi: fairSlotAbi, functionName: 'finalize', args: [eventId, 25], account, chain: arc })
}

// 6. Recompute in TypeScript and compare
const e = await pub.readContract({ address: CONTRACT, abi: fairSlotAbi, functionName: 'getEvent', args: [eventId] })
const winners = await pub.readContract({ address: CONTRACT, abi: fairSlotAbi, functionName: 'getWinners', args: [eventId] })
const r = await pub.readContract({ address: coordinator, abi: coordinatorAbi, functionName: 'getRequest', args: [e.requestId] })
const expected = computeWinners({
  chainId: BigInt(CHAIN_ID), contract: CONTRACT, eventId, manifestHash: mHash,
  requestId: e.requestId, randomWord: e.randomWord, participantCount: PARTICIPANTS, winnerCount: WINNERS, reserveCount: RESERVES,
})
const same = JSON.stringify(expected) === JSON.stringify([...winners])
log(`onchain winners   ${JSON.stringify([...winners])}`)
log(`recomputed winners ${JSON.stringify(expected)}`)
console.log(JSON.stringify({
  result: e.state === 5 && same && r.fulfilled && r.delivered ? 'PASS' : 'FAIL',
  state: e.state, winnersMatch: same, proofAccepted: r.fulfilled, callbackDelivered: r.delivered,
  proofHashNonZero: BigInt(r.proofHash) !== 0n, eventId, requestId: e.requestId.toString(),
}))
