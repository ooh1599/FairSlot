# Security review

Reviewed 2026-11-02. Scope: `contracts/FairSlot.sol`, the database schema and policies, the `api/` functions,
the browser app. This is a self-review plus two automated contract reviews and a static analysis run. It is
not a substitute for an independent professional audit, which you should obtain before mainnet.

## Contract

| Check | Result |
| --- | --- |
| Rule-corpus review, maximum depth | 2 low findings: error context, and a missing comment on one unchecked block. The comment was added. Error parameters were not added: they would change the ABI and add no protection. |
| Adversary and functional review, maximum depth | No material findings |
| Static analysis | 1 "high" (uninitialized state) is a false positive: the winners array is filled by `push` during finalizing, which the tool does not follow. The rest are low or informational (timestamp comparisons that are intended, the change refund call, a benign ordering note). |
| 31 unit tests, 4 tests against the real mainnet coordinator on a local fork | Pass |

Properties that were specifically attacked in review and tests:

- The organizer cannot change the list, counts or time after commit, cannot cancel after the request, and cannot choose or replace the random word.
- The request fee is read inside the same transaction. Any extra value sent is returned to the caller. A caller that cannot receive the change reverts the whole request, so no funds stay in the contract.
- The refund recipient is fixed when the event is committed and cannot be changed.
- A request that expired without an accepted proof can be closed by anyone. A request whose proof was accepted can never be closed as failed; only the same result can be redelivered.
- Finalizing is open to anyone, bounded per transaction, and gives the same winners for any batch size. A caller cannot influence the result.
- A forged callback is rejected: only the coordinator can deliver, and only for a request this contract made.

Accepted trust assumptions (cannot be removed by this contract):

- D20DAO's coordinator and registry are upgradeable by their owner (a Safe) and, by their own documentation, have not been externally audited. A malicious upgrade could withhold or alter delivery. Watch for upgrade events and re-check the implementation address before each event you run. See `docs/verified-integrations.md`.
- The provider can withhold a proof. The result is then a refund and a FAILED event, never a re-roll.
- An organizer can create many events and publicize only a favorable one. The system proves each event is fair, not that the organizer ran only one.
- The random word becomes visible about one block before it is delivered. Nothing the result depends on can change after the request, which is why the list is locked and committed first.

## Findings fixed in this review

| Severity | Where | Problem | Fix |
| --- | --- | --- | --- |
| High | API, locking | The on-chain participant count was not compared with the locked list, so an organizer could commit a different count than the published list. | Confirmation now requires the exact count and algorithm version. |
| High | App, verify page | An organizer-controlled manifest link was rendered and fetched without checking its scheme (`javascript:` link on click; arbitrary hosts and sizes on fetch). | Only `https` links are fetched or shown. Downloads are capped at 3 MB with a timeout. |
| Medium | API, locking | Validation ran after the event was frozen, so a rejected request could leave an unusable locked event. | All checks run before the freeze. |
| Medium | Database | An entry written at the same moment as locking could be missed by the published list. | Entry writes now take a shared lock on the event row, so locking waits for them. |
| Medium | Database, API | Follow-up rows could name ranks outside the draw or entries from another event, and appear in the public delivery list. | Database now rejects them. Public pages only show delivery rows that match the person actually drawn at that rank. |
| Medium | API relay | The read-only chain relay accepted open-ended log queries and calls to any contract, and had no rate limit. | Explicit numeric log ranges, calls and log queries limited to the FairSlot contract and the coordinator, per-instance rate limit. |
| Low | API | Wallet challenges could be created without limit. | At most 5 open challenges per account, expired ones are removed. |
| Low | API | Database error text was returned to the browser. | Removed. |
| Low | Hosting | No security headers. | Added in `vercel.json` (see below). |

## Second pass (same day)

| Severity | Where | Problem | Fix |
| --- | --- | --- | --- |
| Medium | Shared, verify page | A downloaded manifest with missing fields or wrong types could make validation throw instead of failing cleanly, and unknown extra fields were accepted. | The file shape is checked first: wrong types, missing or extra fields are reported as an invalid file. |
| Medium | Public pages | Title, rules and prizes were shown from the database copy even when the committed file was verified. | Once the file matches the onchain hash, pages show the committed text. |
| Medium | Wallet, locking | Switching wallet account between publishing and committing would commit under a different organizer. | The commit button checks the connected account and explains the mismatch. |
| Low | CSV, database | Tabs, line breaks and text-direction overrides were allowed in names; hand-typed entries skipped the email format check. | Rejected in the importer and by database constraints. |
| Low | Transactions | A receipt timeout was shown as a failure although the transaction might still succeed. | Shows a specific message telling the organizer to check the explorer before retrying. |
| Low | Follow-up list | A database refusal could cause repeated retries, and edits failed silently. | One retry stop, with a visible message. |
| Low | Dependencies | The router had known advisories (open redirect, constructor injection). | Upgraded to React Router 7.18.5. Remaining audit findings are in template or build-only packages (Circle kits, the Vercel type package) that the app does not import at runtime. |

New regression tests cover the publish and confirm steps (including a wrong participant count, a different organizer, a changed contract), wallet ownership (wrong signer, replay, other account, expiry, challenge limit), a contract organizer that tries to cancel or request again while receiving change, and fuzzing of the fee refund.

## Third pass (design and language update)

| Severity | Where | Problem | Fix |
| --- | --- | --- | --- |
| Medium | Hosting | The browser security policy was report-only, so it blocked nothing. | Now enforced (scripts only from this site, no plugins, no framing except by Arc Studio, forms and base URL locked, network calls limited to this site, Supabase, and the wallet relay). Tested on a production build, including a negative control that proves an injected script is blocked. |
| Medium | API | Per-address limiter could be reset by an attacker who floods it with new keys, and it trusted a raw X-Forwarded-For. | Never evicts live callers now, and prefers the headers Vercel sets itself. Regression tests added. |
| Low | API | Unauthenticated requests with bad tokens each caused an identity lookup. | Per-address throttle runs before the lookup, plus a per-account throttle. |
| Low | Deployed contract | The deployed mainnet contract had only been checked by bytecode comparison. | The recovery tests (exact fee, binding, expiry, refund) now also run against the deployed mainnet address on a local fork, and a read-only script checks its live state and its agreement with the TypeScript code. |

No new findings in the contract. Dependency audit: the remaining advisories are in the Vercel type package (dev only), the Circle kits that ship with the template (not imported by this app), and nested packages that are not in the production bundle.

## What protects each boundary

- **Private data.** Names, emails and contact notes sit behind Row Level Security and are readable only by the organizer who owns the event. Public pages read through two functions that return no personal data. Public entry IDs are generated by the database, so organizers cannot choose them. Columns that matter (status, manifest, chain, wallet) cannot be written by browsers at all. Locked events cannot change.
- **Wallet ownership.** One-time, expiring challenge signed by the wallet and checked on the server, including contract wallets. The wallet that locks an event is the only one that can commit it, and the chain transaction is re-read and compared field by field before the event is marked committed.
- **Secrets.** The service role key exists only in server functions. Browsers get the public key. No deployer or signing key is stored in the app or on Vercel.
- **Browser.** React escapes all text. Exports neutralize spreadsheet formulas. Links from data are limited to `https`.

## Do before going live

1. Get an independent professional audit of `contracts/FairSlot.sol`.
2. In Vercel, turn on the Firewall rate limit for `/api/*`. The in-app limit is per instance only and is a stopgap.
3. The Content-Security-Policy in `vercel.json` is enforced. It was tested on a production build with a simulated browser wallet (connect, network switch, signature prompt), but not with a real wallet extension. Open the connect dialog once with yours and check the browser console for blocked requests. If you use a custom Supabase domain, or serve the list file from another host, add that host to `connect-src`.
4. Supabase: enable email confirmation, set the site URL and redirect list to your domain only, keep the service role key out of any `VITE_` variable, and turn on database backups.
5. Rehearse the full flow on Arc Testnet, including an expired request and a callback retry.
6. Check `owner()` and the implementation address of D20DAO's coordinator again on the day you deploy.

## Not covered

No penetration test of a live deployment, no load test, no review of Supabase's or Vercel's own configuration, and the publish, confirm and wallet functions are tested against an in-memory stand-in for the database, not a real Supabase project.
