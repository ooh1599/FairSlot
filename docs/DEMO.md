# FairSlot: pitch and demo guide

## One sentence

FairSlot lets anyone running a free giveaway lock the list and rules first, draw once with randomness nobody can steer, and let every participant check the result themselves, without a wallet or any blockchain knowledge.

## The problem

Giveaway draws on social media and at events are decided by a screen recording or "trust me". Participants cannot tell whether the list was edited, whether the draw was repeated until a friend won, or whether the winner was chosen by hand.

## What is different

| Promise | How it is kept |
| --- | --- |
| The list cannot change after the draw is requested | The file with every participant ID, the prize order and the rules is fingerprinted and recorded on Arc before randomness is requested |
| The organizer cannot choose or retry the result | One randomness request per event, from D20DAO's verifiable randomness service. If it fails, the event ends as failed. There is no re-roll |
| Anyone can recompute the winners | The selection is a fixed algorithm over the recorded list. The verify page recomputes it and compares with the contract |
| Participants need no wallet | They check with a public entry ID. Names and emails never leave the organizer's database |
| The organizer pays, participants pay nothing | Draw fee is about 0.03 USDC plus gas on Arc |

## Live demo, 5 minutes

1. **Landing (30 s).** Say the problem. Point at the four promises and the honest limits at the bottom of the page.
2. **Create (60 s).** Sign in, create an event, import `docs/sample-participants.csv` (two rows with problems are flagged and skipped, nine are imported), set 2 winners and 1 reserve with a prize each.
3. **Lock (60 s).** Review page, then publish. Show the fingerprint, then the commit transaction on `explorer.arc.io`.
4. **Draw (60 s).** Ask for the draw. Show the fee quote before the wallet prompt. After the result arrives, press finalize.
5. **Reveal (30 s).** Open the live screen and reveal winners one by one. State that the animation only shows an already confirmed result.
6. **Verify (60 s).** Open the verify page. Walk the five checks. Then open `/verify`, paste only the commit transaction hash in a private window to show it works with no account and no FairSlot database.

Prepare in advance: one finished mainnet event (keep its link) in case the network is slow on stage.

## Judging criteria and where to look

| Criterion | Evidence |
| --- | --- |
| Real use of Arc | Contract on Arc Mainnet, USDC gas, fee quoted in USDC, explorer links on every transaction |
| Trust model | `docs/algorithm.md` (what is guaranteed, what is trusted), `docs/security.md` |
| Engineering quality | 38 contract tests, 4 tests against the live mainnet coordinator on a fork, 53 logic tests, 10 browser tests, database policy tests |
| Usability for non-technical people | English (US) by default with a one-click Thai switch, plain language before technical detail, mobile layouts, keyboard and reduced motion support |
| Honesty | The landing page and verify page say what is and is not proven |

## Questions you will be asked

- **Can the organizer cheat?** Not by editing the list or re-drawing. The remaining risks are in the next question and in "limits" below.
- **Who do you have to trust?** D20DAO's randomness service: its coordinator can be upgraded by its owner, and by its own documentation it has not had an external audit. FairSlot itself has no admin and cannot be upgraded.
- **Why not just use a blockhash?** A block producer can influence it, and an organizer can wait for a favorable block. A verifiable random function cannot be steered by either.
- **Does it stop fake accounts?** No. It proves the draw was fair for the list that was locked, not that each entry is a different person.
- **What if the randomness service is down?** The event ends as failed after the deadline, the fee is refunded, and nothing is redrawn. Participants can see this on the page.

## Limits to state yourself

- Up to 10,000 participants and 50 winners plus reserves per event.
- Prizes are delivered by the organizer outside the system. Delivery status is the organizer's own statement.
- The contract has not had an independent audit.
- The organizer can run several events and announce only one. The system proves each event is fair, not that only one was run.

## Evidence you can show right now

These are real and checkable without any account:

- Mainnet contract, deployed from the owner's wallet: `0x025985bA20a054150C0f7Fbb87E6704ee41E0Aee`, transaction `0xa7b89d4feb1f7d264479ee69bf28f1f234d76b0efe6c1b2c2a98c6ca9a17cb7b` on explorer.arc.io. Its code was compared with the local build.
- A full event on Arc Testnet (contract `0x2d27c4c9dee42fa85e84722fc3a232e593c10a49`): locked, randomness requested, proof accepted and delivered about five seconds later, winners written, and the onchain winners equal an independent recomputation. Event ID `0x4720580d5e4e7f54f37c64afe14c8181ca0992e17300fd6c754b104d77864ea4`, request 6377. With `VITE_CHAIN_ID=5042002` and the testnet address, open `/verify/<event ID>` to see checks 3, 4 and 5 pass. Check 1 correctly fails on this one, because that rehearsal used a placeholder file link; say so on stage rather than hiding it.
- Tests: 38 contract tests, 4 against the real mainnet randomness contract on a local fork, 57 TypeScript tests, 19 browser tests (public pages, organizer journey, security headers), a database policy test, and a read-only health check of the mainnet contract.
