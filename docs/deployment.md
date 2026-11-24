# Deployment guide: Supabase, Vercel, Arc

> Mainnet moves real USDC and transactions cannot be undone. Arc Studio generated this code and configuration but does not deploy to, sign for or fund anything on mainnet. Review, test on testnet, get an independent audit, and run every mainnet step yourself.

Order matters: database, then a testnet rehearsal, then mainnet.

## 0. Prerequisites

- Foundry (`forge`, `cast`), Bun, a Supabase project, a Vercel project, a wallet with USDC on Arc for gas (and the randomness fee).
- Arc Mainnet: chain ID `5042`, RPC `https://rpc.mainnet.arc.io`, explorer `https://explorer.arc.io`. Arc Testnet: chain ID `5042002`, RPC `https://rpc.testnet.arc.io`.
- Re-check the D20DAO coordinator address and implementation before every deployment (see `verified-integrations.md`).

## 1. Supabase

1. Create a project. In the SQL editor (or with the Supabase CLI) run `supabase/migrations/0001_fairslot_schema.sql`.
2. Authentication > Providers: enable Email. Authentication > URL configuration: set **Site URL** to your Vercel URL and add `https://<your-domain>/dashboard` as a redirect URL.
3. Authentication > Email templates: put `{{ .Token }}` in the "Magic Link" template so the 6-digit code works next to the link (the sign-in page asks for either).
4. Confirm the `manifests` bucket exists and is **public**. Do not add insert/update/delete policies for `anon` or `authenticated`: manifests are written only by the server with the service role key.
5. Copy the project URL, the `anon` key and the `service_role` key (Project settings > API). The service role key is a secret: it goes only into Vercel server environment variables.

Optional local check of the schema and RLS policies (needs Docker): `bun run test:db`.

## 2. Contract: testnet rehearsal first

```bash
bun install
forge build
forge test                                  # 31 unit tests incl. golden vectors
forge test --match-contract FairSlotForkTest --fork-url https://rpc.testnet.arc.io   # real coordinator, local fork

export PRIVATE_KEY=<deployer key, never commit it>
forge create contracts/FairSlot.sol:FairSlot \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $PRIVATE_KEY --broadcast \
  --constructor-args 0xd20DA0FF9087d053f0291524Eac12abA1ADBd945
```

Set `VITE_CHAIN_ID=5042002` and `VITE_FAIRSLOT_ADDRESS=<deployed address>` and run a full event on testnet: create, import, lock, commit, request the draw, wait for the provider, finalize, verify. This is the only way to observe a real accepted proof and callback with this contract. Also test the failure path once by not waiting (a refund after 60 s without a proof, if the provider is slow) and test `retryCallback` if you can provoke it.

## 3. Contract: mainnet (you run this, from your own wallet)

```bash
export PRIVATE_KEY=<deployer key, never commit it>
forge create contracts/FairSlot.sol:FairSlot \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $PRIVATE_KEY --broadcast \
  --constructor-args 0xd20da057469C45928912d983F45790C41e290571
```

Prefer a Foundry keystore (`cast wallet import`, then `--account <name>`) over a key in the environment when you can.

Verify before announcing it:

```bash
cast chain-id --rpc-url https://rpc.mainnet.arc.io                    # 5042
cast call <FAIRSLOT> "vrfCoordinator()(address)" --rpc-url https://rpc.mainnet.arc.io   # must equal the coordinator above
cast storage 0xd20da057469C45928912d983F45790C41e290571 \
  0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url https://rpc.mainnet.arc.io  # implementation must match https://d20dao.org/deployments/arc-mainnet.json
cast code <FAIRSLOT> --rpc-url https://rpc.mainnet.arc.io | cast keccak # compare with: forge inspect FairSlot deployedBytecode | cast keccak
```

FairSlot has no owner, no admin, no upgrade path and holds no funds, so there is nothing to configure after deployment. Because the D20DAO coordinator is upgradeable by its owner, re-check its implementation against their manifest from time to time and before large events.

## 4. Vercel

1. Import the repository. Framework preset: Vite (also set by `vercel.json`: `bun install --frozen-lockfile`, `bun run build`, output `dist`, SPA rewrite that leaves `/api/*` alone).
2. Environment variables:

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | all | Supabase project URL (public) |
| `VITE_SUPABASE_ANON_KEY` | all | Supabase anon key (public) |
| `VITE_CHAIN_ID` | all | `5042` (mainnet, default) or `5042002` (testnet) |
| `VITE_FAIRSLOT_ADDRESS` | all | Deployed FairSlot address on that chain |
| `SUPABASE_SERVICE_ROLE_KEY` | server only, **secret** | Used by `/api/*` to lock events, write manifests, verify wallets |
| `ARC_MAINNET_RPC_URL`, `ARC_TESTNET_RPC_URL` | server, optional | Your own RPC endpoint for the read relay and commit checks; defaults to the public Arc RPC |

Never give the service role key a `VITE_` prefix: Vite would ship it to every browser. No deployer key or signing key is ever stored in Vercel or the frontend; the organizer signs every transaction in their own wallet.

3. Deploy. Open `/settings` as an organizer: it shows the chain and contract the build is using. If the contract line says "Not configured", `VITE_FAIRSLOT_ADDRESS` is missing and locking is disabled by design.

Public Arc RPC hosts (`*.arc.io`) are blocked by common ad blockers, so in production the browser reads the chain through `/api/rpc` on your own domain (read methods only, 10 calls per batch, log ranges capped at 10,000 blocks). It has no rate limit of its own; put your own provider key in `ARC_*_RPC_URL` and add Vercel firewall rules if you expect heavy traffic.

## 5. Go-live checklist

- [ ] `forge test`, fork test and `bun run test` pass on the commit you deploy.
- [ ] Testnet rehearsal done end to end, including `finalize` and the verify page showing steps 1 to 5 green.
- [ ] Independent audit of `FairSlot.sol` and the D20DAO trust assumptions accepted (they state the D20DAO contracts are not externally audited).
- [ ] Supabase email deliverability tested; Site URL and redirect URLs set.
- [ ] `VITE_CHAIN_ID` and `VITE_FAIRSLOT_ADDRESS` point at the same chain.
- [ ] Organizers know they need USDC on Arc for gas and the randomness fee (read `pricing()` for the current fee; mainnet minimum was 0.02 USDC on 2026-11-02).
- [ ] Back up Supabase (events, entries, audit log). Participant emails are personal data: set a retention period and a deletion process.

## 6. Operations

- A stuck event is never rescued by changing data: use the buttons on the manage page (resend result, refund, close as failed). All are permissionless on-chain calls.
- Changing a locked event is impossible by design. Create a new event with a new ID; the old one stays verifiable.
- To rotate the service role key, rotate it in Supabase, update Vercel, redeploy.
