/**
 * Read-only health check of the deployed FairSlot on Arc Mainnet. Sends no transaction.
 * Usage: bun scripts/check-mainnet.ts [contractAddress]
 */
import { createPublicClient, http, keccak256, stringToBytes, type Abi, type Address } from 'viem'
import { arc } from 'viem/chains'
import { coordinatorAbi } from '@d20dao/vrf-sdk/abi'
import { fairSlotAbi } from '../shared/fairslotAbi.ts'
import { D20_COORDINATOR } from '../shared/chains.ts'
import { onchainEventId } from '../shared/draw.ts'
import { eventIdToBytes32 } from '../shared/manifest.ts'

const CONTRACT = (process.argv[2] ?? '0x025985bA20a054150C0f7Fbb87E6704ee41E0Aee') as Address
const pub = createPublicClient({ chain: arc, transport: http('https://rpc.mainnet.arc.io') })
const coordinator = D20_COORDINATOR[5042]
const results: [string, boolean, string][] = []
const check = (name: string, ok: boolean, detail = '') => results.push([name, ok, detail])

const chainId = await pub.getChainId()
check('chain id is 5042', chainId === 5042, String(chainId))

const code = await pub.getCode({ address: CONTRACT })
check('contract has code', Boolean(code && code !== '0x'), `${((code?.length ?? 2) - 2) / 2} bytes`)

const wideAbi: Abi = fairSlotAbi
const read = (functionName: string, args: readonly unknown[] = []): Promise<unknown> =>
  pub.readContract({ address: CONTRACT, abi: wideAbi, functionName, args })

check('coordinator is the verified D20DAO proxy', String(await read('vrfCoordinator')).toLowerCase() === coordinator.toLowerCase())
check('MAX_PARTICIPANTS = 10000', (await read('MAX_PARTICIPANTS')) === 10000n)
check('MAX_PICKS = 50', Number(await read('MAX_PICKS')) === 50)
check('CALLBACK_GAS = 150000', Number(await read('CALLBACK_GAS')) === 150000)
check('contract holds no funds', (await pub.getBalance({ address: CONTRACT })) === 0n)

const block = await pub.getBlock()
const base = block.baseFeePerGas ?? 0n
const mine = (await read('quoteFeeAt', [base])) as bigint
const theirs = await pub.readContract({ address: coordinator, abi: coordinatorAbi, functionName: 'quoteFeeAt', args: [150000, base] })
check('FairSlot fee quote equals the coordinator quote', mine === theirs, `${mine} wei`)
check('fee quote is at least the 0.02 USDC minimum', mine >= 20_000_000_000_000_000n)

// ID derivation: the contract and the TypeScript code must agree byte for byte.
const organizer = '0x1111111111111111111111111111111111111111' as Address
const publicId = 'fs_0123456789abcdefghjk'
const viaContract = await read('eventIdFor', [organizer, eventIdToBytes32(publicId)])
const viaTs = onchainEventId(5042n, CONTRACT, organizer, eventIdToBytes32(publicId))
check('event ID derivation matches TypeScript', viaContract === viaTs)

const sim = await pub.simulateContract({
  address: CONTRACT,
  abi: fairSlotAbi,
  functionName: 'commitEvent',
  args: [eventIdToBytes32(publicId), keccak256(stringToBytes('manifest')), 'https://example.org/m.json', 10, 2, 1, 1, 0n, organizer],
  account: organizer,
})
check('a commit is accepted (simulated only)', sim.result === viaTs)
const unknown = (await read('getEvent', [viaTs])) as { state: number }
check('unknown event reads as state 0', unknown.state === 0)

let failed = 0
for (const [name, ok, detail] of results) {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
console.log(failed === 0 ? `\nAll ${results.length} checks passed against ${CONTRACT}` : `\n${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
