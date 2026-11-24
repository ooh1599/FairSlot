# Community post (copy and paste)

Post to: https://community.arc.io/home/forum/create-post
Attach: `docs/community/fairslot-home.png` and `docs/community/fairslot-verify.png`

---

## Title

FairSlot: gift giveaways anyone can verify, built on Arc

## Body

I built FairSlot, a small app for running gift giveaways where nobody has to take the organizer's word for it.

**The idea**
Lock the list first. Draw once. Let everyone check.

1. The organizer imports entries (CSV or by hand). Every entry gets a random public code. Names and emails are never published.
2. The list, the rules, the prizes and a fingerprint (hash) of all of it are recorded on Arc. After that nothing can be added, removed or reordered.
3. The organizer requests one random result from D20DAO's verifiable randomness and pays a small fee in USDC (about 0.03 USDC at today's quote).
4. Winners and backups are picked from that single result with a partial Fisher-Yates shuffle and rejection sampling, so every entry has an equal chance. Anyone can recompute the result and compare it with the contract.

Entrants never need a wallet. They open a link, find their code, and see the result.

**What is live today**
- FairSlot contract on Arc Mainnet: https://explorer.arc.io/address/0x025985bA20a054150C0f7Fbb87E6704ee41E0Aee
- Public site (English by default, Thai available): https://fairslot.netlify.app
- A verify page that needs no account. Paste a lock transaction hash and it reads Arc directly and checks each step separately.
- A full run on Arc Testnet: lock, request, proof accepted and delivered by D20DAO about 5 seconds later, winners written, and the onchain winners equal an independent TypeScript recomputation.

**What is not live yet (being honest)**
- The organizer side (sign-in, creating events, locking) needs a Supabase project and serverless functions that I have not connected to the public site yet, so it shows a setup notice there.
- No real event has run on the mainnet contract yet, so I have not seen a random result delivered on mainnet. Only on testnet.
- The contract has had two automated deep reviews and a lot of tests, but no independent audit. The contract is immutable, and D20DAO's own contracts are upgradeable and, by their documentation, not externally audited.

**Things I tried to get right**
- If the provider never answers, the event ends as failed and the fee can be refunded. There is no re-roll.
- If a proof is accepted but delivery fails, anyone can resend the same result. A new draw is never requested.
- The fee is read inside the same transaction and any extra is returned in the same transaction. The contract holds no funds.
- Prizes are handed over by the organizer outside the app. No ticket sales, no betting, no prize escrow.

**Stack**
Solidity 0.8.28 and Foundry (38 tests, plus tests against the real mainnet coordinator on a local fork), React, Vite, wagmi and viem, Supabase with Row Level Security, D20DAO VRF. Built with Arc Studio.

**Feedback welcome**
- Does the "verify" page explain things clearly enough for non-technical entrants?
- Would you want ERC-20 or USDC prizes handled in the app later, or is outside delivery fine?
- Anything in the failure policy that you would change?

Happy to answer questions.
