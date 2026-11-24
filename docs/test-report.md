# Test report

Run on 2026-11-02 in the build sandbox.

## Results

| Suite | Command | Result |
| --- | --- | --- |
| Contract unit tests (mock coordinator) | `forge test` | 38 passed (includes golden vectors, 256-run fuzz over counts and words, batch-size independence, callback-failure retry, expiry, refund hook) |
| Contract tests against the real coordinator (local fork, read-only) | `forge test --match-contract FairSlotForkTest --fork-url https://rpc.mainnet.arc.io` | 4 passed: request binding and exact fee, expiry + refund + `onRefund` closing the event, `markFailed`, underpaid fee. Without `--fork-url` these tests return immediately |
| TypeScript logic | `bun run test` | 57 passed: golden vectors equal to Solidity, rejection sampling, uniformity sanity, canonical JSON and manifest hash, CSV import and formula-safe export, Thai/English message parity, read-only RPC relay, publish and confirm steps, wallet ownership |
| Live testnet rehearsal | `bun scripts/e2e-testnet.ts` | PASS: commit, request, proof accepted, callback delivered, finalize; onchain winners equal the recomputation (request 6377). Details in `verified-integrations.md` |
| Browser tests | `bun run e2e` | 10 passed (desktop and mobile): English (US) default, Thai switch and reload, no horizontal overflow, event lookup, sign-in guard, chain verify input, not-found page |
| Organizer journey in a browser | `bun run e2e:flow` | 2 passed: create draft, import the sample CSV (two bad rows skipped, re-import adds nothing), review, reach the wallet step; connect a wallet that starts on another network, end on Arc, ask for the ownership signature. Uses an in-memory Supabase stand-in and a simulated wallet |
| Security headers in a browser | `bun run e2e:csp` | 7 passed: no policy violations on five pages and on the wallet flow, plus a negative control |
| Deployed mainnet contract | `bun run check:mainnet` and the fork tests with `FAIRSLOT_FORK_ADDRESS` | 12 live read checks pass; 4 fork tests pass against the deployed address |
| Pre-launch review (2026-11-12) | two contract reviews at maximum depth, source-to-chain comparison | No material findings; one low cosmetic note (more context in error messages) that was not applied because it would change the contract. Current source equals the code deployed on Arc Mainnet. Coordinator owner, implementation and code hash equal the official D20DAO manifest. |
| Mainnet smoke script, dry run | `scripts/smoke-mainnet.ts` against a local fork | Commit, request, expiry and close-as-failed all ran against the deployed contract. Not run on live mainnet by Arc Studio. |
| Database schema and RLS | `bun run test:db` (Docker, Postgres 18 with Supabase-like stubs) | passed: owner isolation, anonymous denial, locked-event immutability, write-once commitments, audit log without emails, public functions |
| Lint and types | `bun run check` | clean |
| Production build | `bun run build` | succeeds |
| Independent review of `FairSlot.sol` | two reviews (rule-based and behaviour/adversary) | no material findings |

## Measurements

- `finalize(25)` at 10,000 participants: about 782,000 gas. Two transactions cover the maximum 50 picks.
- Coordinator callback: about 76,000 gas including the mock; the configured limit is 150,000.
- Runtime bytecode: 8,867 bytes.

## Not run, and why

- **Playwright end-to-end tests: not written or run.** Browsers are not installed in the build sandbox and there is no Supabase project or deployed contract to drive. The main flows are covered by logic tests and type checks only.
- **API functions** (`/api/wallet`, `/api/events`) have no automated tests against a live Supabase; only `/api/rpc` is unit-tested. Lock and commit-confirmation logic should be exercised on testnet.
- **Expired request, failed callback and refund on a live network** were not exercised, because the provider answered in time. They are covered by mock and fork tests.
- **Mainnet:** the contract is deployed but has not run an event.
- No load test of the 10,000-row CSV import in a browser against Supabase; the import is batched in 500-row inserts.
