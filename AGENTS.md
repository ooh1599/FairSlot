# FairSlot

> Built with Arc Studio - money-powered apps in minutes

Project memory for agents and developers.

## What This App Does

Commit-then-draw winner selection for free gift giveaways. Organizers lock a pseudonymous participant manifest, commit its hash to the FairSlot contract on Arc, request one random word from D20DAO VRF, and anyone can finalize and verify the winners. No prize escrow, no betting.

## Tech Stack

- Frontend: React 18, Vite, TypeScript (strict), Tailwind CSS, React Router 7, wagmi v2 + viem, ConnectKit (injected wallets)
- Backend: Vercel functions in `api/` (wallet nonce, manifest publish, commit confirmation, read-only RPC relay), Supabase Postgres + RLS + Storage
- Contracts: Solidity 0.8.28 + Foundry in `contracts/FairSlot.sol`, tests in `contracts/test/`. Consumes `@d20dao/vrf-sdk@0.6.2`.
- Shared logic (used by app, API and tests): `shared/` (canonical JSON, manifest, draw algorithm, CSV, IDs, limits)
- Chain: Arc Mainnet 5042 (default) / Arc Testnet 5042002 via `VITE_CHAIN_ID`. Native gas is USDC (18 decimals); fees are shown once as USDC.
- Package manager: bun. Deviation from the original brief (Next.js, pnpm, shadcn, monorepo, Playwright): the Arc Studio sandbox is Vite + bun, so the app is a Vite SPA with Vercel functions; Playwright is not set up.

## Key Files

- `contracts/FairSlot.sol`, `contracts/test/FairSlot.t.sol`, `contracts/test/FairSlotFork.t.sol`
- `shared/draw.ts` must stay byte-identical in behavior to the contract; `docs/golden-vectors.json` (`bun run vectors`) pins it.
- `shared/fairslotAbi.ts` is generated: `forge build && bun run abi`.
- `supabase/migrations/0001_fairslot_schema.sql` + `supabase/tests/` (`bun run test:db`)
- `src/pages/*`, `src/components/*`, `src/i18n/*` (Thai is the key source, English must match; a test enforces it)
- `docs/` deployment, algorithm, verified integrations, test report

## Deployments

None. FairSlot is not deployed on any network yet. After deploying, record the address here and in `VITE_FAIRSLOT_ADDRESS`.

## Rules to keep

- Never use `Math.random`, `Date.now`, `block.timestamp` or `blockhash` for winner selection.
- Never rewrite locked event data; changes mean a new event with a new ID.
- No secrets in `VITE_` variables. The service role key is server-only.
- Change the draw algorithm only with a new `algorithmVersion` and new golden vectors.

## Share links

- `src/lib/share.ts` ships `getShareBase`, `buildShareLink` and `installShareSync`; use `buildShareLink()` for any link a user copies. Keep `installShareSync()` in `src/main.tsx`. Never put a secret in a path or query.

## To Run

```bash
bun install
bun run dev
```

## Deployments

- Arc Testnet (5042002): FairSlot `0x2d27c4c9dee42fa85e84722fc3a232e593c10a49`, tx `0xbaa54de5f6025e09ff736414833845863ee2c2fb4de47bc6163833f659592a5e`, deployed 2026-11-09. Coordinator `0xd20DA0FF9087d053f0291524Eac12abA1ADBd945`. Deployed bytecode matches the local build.
- Arc Mainnet (5042): FairSlot `0x025985bA20a054150C0f7Fbb87E6704ee41E0Aee`, tx `0xa7b89d4feb1f7d264479ee69bf28f1f234d76b0efe6c1b2c2a98c6ca9a17cb7b` (block 30381619), deployed by the owner from their own wallet via Remix. Coordinator `0xd20da057469C45928912d983F45790C41e290571`. Runtime code checked identical to the local build (immutables masked, metadata ignored) on 2026-11-09.
- `.env` now points the app at Arc Mainnet (`VITE_CHAIN_ID=5042`, `VITE_FAIRSLOT_ADDRESS` = mainnet address above). For testnet rehearsal use 5042002 and the testnet address.
