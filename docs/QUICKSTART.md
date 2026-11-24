# Quickstart: from this project to a live site (about 20 minutes)

You need three free accounts: GitHub or Vercel, Supabase, and a wallet with a little USDC on Arc. The contract is already deployed on Arc Mainnet (address in `AGENTS.md`), so there is nothing to compile.

## 1. Database (Supabase, 5 minutes)

1. Create a project at supabase.com. Pick a region close to your users (Singapore for Thailand).
2. Open **SQL Editor**, paste the whole of `supabase/all.sql`, and run it. It creates the tables, access rules and the public storage bucket for event files.
3. Open **Authentication > Emails > Magic link** and make the template show the six digit code as well as the link: add `Your code: {{ .Token }}`. The sign-in page accepts either.
4. Open **Authentication > URL Configuration**. Set **Site URL** to your final site address (you get it in step 2 below) and add the same address to **Redirect URLs**. Do not leave wildcards.
5. Open **Project Settings > API** and copy three values: Project URL, `anon` public key, and `service_role` secret key. The secret key goes only into server settings, never into a variable that starts with `VITE_`.

## 2. Site (Vercel, 5 minutes)

1. Push the project to GitHub, or connect Vercel through the Integrations menu in Arc Studio.
2. Import it in Vercel. The settings in `vercel.json` are picked up automatically.
3. Add these environment variables (Production):

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | `anon` public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret key |
   | `VITE_CHAIN_ID` | `5042` |
   | `VITE_FAIRSLOT_ADDRESS` | the mainnet contract address from `AGENTS.md` |

4. Deploy. Copy the site address back into Supabase step 4.
5. In Vercel, turn on the Firewall rate limit for `/api/*`.

## 3. First run on mainnet (5 minutes, uses real USDC)

Use a tiny event so a mistake costs little. A request costs about 0.03 USDC at current settings, plus gas.

1. Open the site, sign in with your email, create an event with 3 participants and 1 winner.
2. Connect the wallet that holds USDC on Arc and sign the ownership message.
3. Lock and publish, confirm the commit transaction, then ask for the draw and confirm in the wallet.
4. Wait for the result, press the finalize button, and open the verify page. All five checks should be green.

If a request is not answered in time, the page shows it as expired and offers the refund; the event ends as failed and the fee can be refunded to the organizer wallet from the same page. Nothing is re-rolled; to try again, create a new event.

## 4. Before you show it to others

- Keep the first mainnet event and its verify link; it is your live proof.
- Optional rehearsal without real money: set `VITE_CHAIN_ID=5042002` and `VITE_FAIRSLOT_ADDRESS=0x2d27c4c9dee42fa85e84722fc3a232e593c10a49` (Arc Testnet copy of the contract), and get test USDC from the Arc Studio sidebar.
- The Content-Security-Policy in `vercel.json` is enforced. During your first full run with your wallet, keep the browser console open and look for blocked requests; a custom Supabase domain or a list file hosted elsewhere must be added to `connect-src` (see `docs/security.md`).

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Page says the backend is not configured | `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` missing; redeploy after adding them |
| Sign-in email never arrives | Supabase built-in email is rate limited; configure your own SMTP in Authentication settings |
| Lock fails with "contract not configured" | `VITE_FAIRSLOT_ADDRESS` or `VITE_CHAIN_ID` missing in Vercel |
| Wallet will not sign the commit | Wallet is on another network; use the switch button in the page |
| "insufficient funds" | The wallet needs USDC on Arc for gas and the draw fee |

## Optional: prove mainnet end to end without the website

`scripts/smoke-mainnet.ts` runs one tiny real event (5 entries, 1 winner, 1 backup) on Arc Mainnet with your own wallet: commit, request, wait for the provider, finalize, and compare the winners with an independent recomputation. It costs about 0.03 USDC for the fee plus gas and cannot be undone. Run it yourself, in your own terminal, with the key in an environment variable:

```bash
SMOKE_PRIVATE_KEY=0x... CONFIRM_MAINNET=yes bun scripts/smoke-mainnet.ts
```

It refuses to run without both variables. To rehearse it without spending anything, start `anvil --fork-url https://rpc.mainnet.arc.io --block-time 2` and add `SMOKE_RPC_URL=http://127.0.0.1:8546` (the fork cannot produce a real randomness proof, so that run ends at the expiry path).

