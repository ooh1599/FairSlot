# Verified integrations

Checked on **2026-11-02** (UTC). Values below were read from the official sources and from the live chain, not from memory.

## Sources read

| Source | Used for |
| --- | --- |
| https://d20dao.org/docs/integration | Consumer pattern, fee rules (`quoteFee` inside the requesting tx, never via `eth_call`), result handling, recovery gas limits |
| https://d20dao.org/docs/deployments | Coordinator proxy and implementation addresses |
| https://d20dao.org/docs/architecture | Epoch / request lifecycle, 60 second deadline |
| https://d20dao.org/docs/verification | What a replay checks and what it does not |
| https://d20dao.org/docs/security | Trust assumptions (below) |
| https://d20dao.org/deployments/arc-mainnet.json, arc-testnet.json | Manifest: owner, implementation code hash, pricing |
| https://github.com/d20dao/d20-sdk (AGENTS.md, API.md, `protocol/`) | Exact Solidity interfaces, `getRequest` layout, error names |
| https://docs.arc.io/arc/references/connect-to-arc, `use-arc` reference | Chain IDs, RPC and explorer URLs, native USDC (18 decimals) vs ERC-20 USDC (6 decimals) |
| https://docs.arc.io/arc/references/gas-and-fees | Fee model: gas is paid in USDC |
| https://vercel.com/docs (functions, rewrites, env vars) | Deployment layout (`api/`, `vercel.json`) |

## Arc

| | Mainnet | Testnet |
| --- | --- | --- |
| Chain ID | 5042 (RPC returned `0x13b2`) | 5042002 (RPC returned `5042002`) |
| RPC | https://rpc.mainnet.arc.io | https://rpc.testnet.arc.io |
| Explorer | https://explorer.arc.io | https://explorer.testnet.arc.io |
| Native gas token | USDC, 18 decimals | USDC, 18 decimals |
| ERC-20 USDC | `0x3600000000000000000000000000000000000000`, 6 decimals | same |

Native USDC and ERC-20 USDC are one pool of money in two views. FairSlot only deals with the native view (fees, `msg.value`) and shows it once, as USDC. No code path adds the two views together.

## D20DAO VRF coordinator (read from the chain, 2026-11-02)

| Check | Arc Mainnet | Arc Testnet |
| --- | --- | --- |
| Coordinator proxy | `0xd20da057469C45928912d983F45790C41e290571` | `0xd20DA0FF9087d053f0291524Eac12abA1ADBd945` |
| Proxy has code | yes | yes |
| EIP-1967 implementation slot | `0xD20da000125643B4db5A6A36A3b853c17745DF44` | same implementation |
| Implementation code hash | `0x3dda400d...348c`, equals the manifest value | not compared (same address) |
| Proxy code hash | `0x1e98fe55...716f`, equals the manifest value | not compared |
| `owner()` | `0xB57f656149749eff6b496dF090336491f977E744` (DAO treasury Safe, as documented) | not read |
| `pricing()` | minFee 0.02 USDC, multiplier 3, overhead 300,000 gas | minFee 0.08 USDC, multiplier 5, overhead 300,000 gas |
| `quoteFeeAt(150000, 20 gwei)` | 0.027 USDC | 0.08 USDC |

Interface used by FairSlot: `quoteFee`, `quoteFeeAt`, `requestRandomness(clientSeed, callbackGasLimit, refundAddress)`, `getRequest` (17-field struct, decoded successfully against the live mainnet and testnet contracts in the fork tests), callback `rawFulfillRandomness` and refund hook `onRefund` via `D20VRFConsumer`. Recovery calls used by the UI: `retryCallback`, `refundRequest` (gas 400,000), `withdrawRefundCredit`.

The SDK is pinned to `@d20dao/vrf-sdk@0.6.2`; `D20VRFConsumer.sol` and `ID20VRF.sol` are imported from the package, not copied.

### Trust assumptions disclosed by D20DAO (shown to users on the verification page)

- Single operator and a fixed secp256k1 VRF key; the operator can withhold a proof (the request then expires and is refundable) but cannot substitute another result for a fixed seed.
- Entropy source is the drand evmnet beacon; a drand signature shows what the beacon key signed, not that it is unbiased.
- Coordinator and registry are upgradeable by the owner (Safe). A stable proxy address is not a promise of unchanged behavior; check the implementation against the manifest before relying on it.
- The D20DAO contracts have not had an external security audit according to the SDK documentation.

## What was NOT verified

- **FairSlot deployments.** Arc Testnet: `0x2d27c4c9dee42fa85e84722fc3a232e593c10a49` (2026-11-09). Arc Mainnet: `0x025985bA20a054150C0f7Fbb87E6704ee41E0Aee`, deployed by the owner from their own wallet (tx `0xa7b89d4feb1f7d264479ee69bf28f1f234d76b0efe6c1b2c2a98c6ca9a17cb7b`, block 30381619). Mainnet checks done 2026-11-09: chain ID 5042; runtime code equals the local and Remix builds once the immutable coordinator value is masked and the metadata trailer ignored; coordinator and rng are the verified D20DAO coordinator; limits read 10000 / 50 / 150000; contract balance 0. The mainnet contract has not yet processed an event; the live rehearsal below ran on Arc Testnet only.
- **Live rehearsal on Arc Testnet (2026-11-09).** `scripts/e2e-testnet.ts` ran a full event on the deployed testnet contract with a throwaway wallet: commit, request (fee 0.08 USDC, exact), proof accepted and callback delivered by D20DAO about 5 seconds later (request 6377, proof hash non-zero), finalize in one transaction, and the onchain winners `[8,12,5,11,7]` equal the TypeScript recomputation. Event ID `0x4720580d5e4e7f54f37c64afe14c8181ca0992e17300fd6c754b104d77864ea4`. The manifest link used in that run is a placeholder, so the file check of the verify page does not apply to it. Not exercised live: an expired request, a failed callback and a refund (the provider answered in time); those paths are covered by the mock and fork tests only. The same flow has not been run on mainnet.
- The browser does **not** replay the VRF proof mathematically. The verify page checks acceptance and binding on-chain and links to the D20DAO Explorer for a full replay.
- Supabase, Vercel and the email provider were not available in the build environment: the SQL schema and RLS policies were tested on a local Postgres with Supabase-like stubs; the API functions and UI were type-checked and unit-tested but not run end to end against a live Supabase project.

## Dependency versions

| Package | Version |
| --- | --- |
| Solidity compiler | 0.8.28 (EVM `cancun`), Foundry 1.7.1 |
| `@openzeppelin/contracts` | 5.6.1 |
| `@d20dao/vrf-sdk` | 0.6.2 |
| `viem` | 2.57.5 |
| `wagmi` | 2.19.5 |
| `@supabase/supabase-js` | 2.118.0 |
| `react` / `react-router-dom` | 18.3.1 / 7.18.5 |
| `vite` | 6.4.5 |
| `vitest` | 5.0.5 |
| `@vercel/node` | 29.0.1 |
| `typescript` | 7.0.2 |
| `bun` | see `.bun-version` |
