# Deploy FairSlot with Remix (Arc Mainnet)

Arc Studio cannot deploy to or sign on mainnet. You deploy from your own wallet. This guide uses https://remix.ethereum.org.

Source to paste: `docs/remix/FairSlot.flat.sol` (all imports flattened, pinned to the versions in `docs/verified-integrations.md`).
It compiles to the same runtime code as `contracts/FairSlot.sol` (checked on 2026-11-09; only the metadata trailer differs).

> **Pick the right contract.** The flattened file contains two empty helper libraries (`RandomnessMapping`, `StorageSlot`) and the real contract `FairSlot`. In **Deploy & Run**, open the **Contract** dropdown and choose **`FairSlot - FairSlot.sol`**. Deploying a library by mistake succeeds but is useless (it only costs gas). A correct deployment shows a `coordinator` field next to the Deploy button; if you do not see that field, you have the wrong contract selected.

## 1. Compile

1. Open Remix, create a file `FairSlot.sol`, paste the whole content of `FairSlot.flat.sol`.
2. Solidity compiler tab:
   - Compiler: `0.8.28`
   - EVM version: `cancun`
   - Enable optimization: on, runs `200`
3. Compile. There should be no errors (warnings about unsafe typecast are expected).

## 2. Add Arc Mainnet to your wallet

| Field | Value |
| --- | --- |
| Network name | Arc Mainnet |
| RPC URL | https://rpc.mainnet.arc.io |
| Chain ID | 5042 |
| Currency symbol | USDC |
| Explorer | https://explorer.arc.io |

Check the values against https://docs.arc.io/arc/references/connect-to-arc before saving. Your wallet needs real USDC on Arc Mainnet to pay gas.

## 3. Deploy

1. Deploy & Run tab. Environment: `Injected Provider - MetaMask`.
2. Confirm Remix shows `Custom (5042) network`. If it shows another number, stop.
3. Contract: `FairSlot`.
4. Constructor argument `coordinator`: `0xd20da057469C45928912d983F45790C41e290571`
   (D20DAO coordinator on Arc Mainnet. Re-check it in `docs/verified-integrations.md` and on https://d20dao.org/docs/deployments the day you deploy.)
5. Press Deploy and confirm in your wallet. Copy the contract address from the Remix log.

Do not send any value with the deploy. The contract has no owner and cannot be changed after deployment.

## 4. Check the result (before anyone uses it)

In Remix, under the deployed contract, call:
- `vrfCoordinator` must return the address from step 3.4.
- `MAX_PARTICIPANTS` must return `10000`.

Open the address in the explorer and confirm it has code. Then send me the address and I will compare its runtime code with the local build.

## 5. Connect the app

In Vercel set `VITE_CHAIN_ID=5042` and `VITE_FAIRSLOT_ADDRESS=<your address>`, then redeploy. Before opening it to organizers, finish the list in `docs/security.md` (independent audit, Testnet rehearsal, rate limits).

Testnet rehearsal: the same file works for Arc Testnet (chain 5042002, coordinator `0xd20DA0FF9087d053f0291524Eac12abA1ADBd945`). A copy is already deployed at `0x2d27c4c9dee42fa85e84722fc3a232e593c10a49`.
