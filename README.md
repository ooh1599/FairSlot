# FairSlot

FairSlot lets an organizer run a fair gift giveaway: the participant list, rules and prizes are locked before anything is drawn, the random result comes from a verifiable provider, and anyone can check the outcome against records on Arc. Participants need no wallet.

Built with [Arc Studio](https://studio.arc.io)

## What it does

- Organizers sign in with email, import a CSV or add people by hand, check for duplicates and mistakes, then lock the list.
- Everyone gets a random public code. Names, emails and contact details are never published.
- The organizer connects a wallet once to lock the event and pay the randomness fee. Prizes are delivered by the organizer outside the system.
- Participants open the event page without signing in, check their code, and see the result.
- A verification page checks each step separately and says plainly when evidence is incomplete. It also works from a transaction hash alone, with no account.
- English (US) by default, Thai available with one click. Times are shown in Thailand time (UTC+7).

Limits: up to 10,000 participants; winners plus reserves up to 50. No ticket sales, betting or prize escrow.

## Tech stack

- React, TypeScript, Vite, Tailwind CSS, React Router
- wagmi and viem for wallet and chain access
- Supabase (Postgres with Row Level Security, Auth, Storage)
- Solidity 0.8.28 with Foundry, D20DAO verifiable randomness
- Vercel (static app plus serverless functions in `api/`)
- Vitest for TypeScript tests, Playwright for browser tests

## Development

Prerequisites: [Bun](https://bun.sh), [Foundry](https://getfoundry.sh), Docker (only for the database test).

```bash
bun install
bun run dev          # app on http://localhost:5173
bun run check        # lint and type check
bun run test         # TypeScript tests
bun run e2e          # browser tests (needs Chromium: bunx playwright install chromium)
bun run e2e:flow     # organizer journey in the browser, against an in-memory Supabase stand-in
bun run e2e:csp      # production build under the enforced security headers
bun run check:mainnet   # read-only health check of the deployed contract on Arc Mainnet
# scripts/smoke-mainnet.ts: one tiny real event with your own wallet (spends real USDC, see docs/QUICKSTART.md)
bun run test:contracts   # Solidity tests
bun run test:db      # database schema and policy test (Docker)
bun run build        # production build
```

Environment variables (see `.env.example`):

| Name | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase public key |
| `VITE_CHAIN_ID` | `5042` for Arc Mainnet (default) or `5042002` for Arc Testnet |
| `VITE_FAIRSLOT_ADDRESS` | Address of the deployed FairSlot contract |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret used by the API functions |
| `ARC_MAINNET_RPC_URL`, `ARC_TESTNET_RPC_URL` | Optional own RPC endpoints for the API functions |

Without Supabase variables the organizer pages show a setup notice. Without a contract address, locking on-chain is disabled.

## Documentation

- `docs/QUICKSTART.md`: from this project to a live site in about 20 minutes
- `docs/DEMO.md`: pitch, five minute demo script, likely questions
- `docs/deployment.md`: Supabase, Vercel and Arc deployment, go-live checklist
- `docs/verified-integrations.md`: sources, dates, addresses and what is not verified
- `docs/algorithm.md`: how winners are chosen, the manifest format, failure policy
- `docs/security.md`: security review, fixes, trust assumptions and the go-live checklist
- `docs/test-report.md`: what was tested and what was not
