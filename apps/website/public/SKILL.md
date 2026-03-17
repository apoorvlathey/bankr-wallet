---
name: walletchan
description: Interact with web3 dapps using the WalletChan browser extension via Chrome CDP. Use when the user asks to connect a wallet, swap tokens, supply/deposit to DeFi protocols, sign messages, view balances on-chain, or perform any blockchain transaction through a dapp in the browser. Requires Chrome with remote debugging and the WalletChan extension installed.
---

# WalletChan — Browser Wallet Agent Skill

Control the [WalletChan](https://walletchan.com/) browser extension to interact with any web3 dapp via Chrome DevTools Protocol (CDP).

## Prerequisites

1. **Chrome** installed with remote debugging enabled (e.g. `--remote-debugging-port=9222`)
2. **WalletChan extension** installed from the [Chrome Web Store](https://chromewebstore.google.com/detail/walletchan/kofbkhbkfhiollbhjkbebajngppmpbgc)
3. **Agent password configured** — the user must set an Agent Password in WalletChan settings before the agent can operate

> **⚠️ IMPORTANT — Tell the user:**
> - Set an **Agent Password** in WalletChan settings and share it with the agent.
> - **NEVER share the Master Password** with ANY agent. The Master Password controls private key access. Agents must ONLY ever receive the Agent Password.
> - The Agent Password grants limited scope: unlock the wallet, review & confirm transactions. It cannot reveal or export private keys.

## Setup

### Launch Chrome with CDP

The user needs Chrome running with remote debugging. Example launch script:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.walletchan-agent/chrome-profile" \
  --no-first-run \
  --no-default-browser-check
```

Adjust the path for the user's OS. The `user-data-dir` should be a dedicated profile with the WalletChan extension installed.

### Get the Extension ID

- **Chrome Web Store build:** `kofbkhbkfhiollbhjkbebajngppmpbgc` (stable)
- **Local/dev builds:** ID varies — navigate to `chrome://extensions/` via CDP and read it

The extension's full-tab URL is: `chrome-extension://<EXTENSION_ID>/index.html`

### Connect via CDP

Connect to Chrome using CDP on the configured port (default `9222`). All interaction happens through browser automation — navigate tabs, click elements, read page content.

**Always use CDP** for tab control. Chrome sidepanels are NOT accessible via CDP, so WalletChan must be used in **full-tab mode** (open `chrome-extension://<ID>/index.html` in a tab).

## Core Workflow

### 1. Navigate to the dapp

Open the target dapp URL in a Chrome tab (e.g. `app.aave.com`, `app.uniswap.org`).

### 2. Connect wallet

Click the dapp's "Connect Wallet" button and select **"WalletChan"** from the wallet list. Connection is instant — no popup or approval needed.

### 3. Interact with the dapp

Perform the intended action: enter amounts, select tokens, click "Supply", "Swap", etc. This triggers a transaction or signature request in WalletChan.

### 4. Switch to the extension tab

Navigate to the WalletChan tab (`chrome-extension://<ID>/index.html`) so the request is visible. **Always switch the visible/active tab** — the user can only see the active tab, so switch to whichever tab you're working on.

### 5. Check lock state & unlock

WalletChan has an **auto-lock** feature — the wallet locks after inactivity. Before confirming any request:

1. Check if the wallet is locked (password prompt visible)
2. If locked, enter the **Agent Password** and click Unlock
3. The pending request will appear after unlocking

### 6. Review the request

WalletChan provides two views for each request:

- **Decoded tab** — human-readable breakdown of the transaction:
  - Function name and parameters
  - Recursively decoded nested calldata (e.g. bytes params containing inner calldata)
  - Auto-resolved ENS, Basename (`.base.eth`), and `.wei` domains for addresses
  - Labels for known contract addresses
  - Unit conversion dropdowns for uint params (wei→ETH, unix timestamps, 10^6, bps, etc.)
  - Some params (like `bytes`) may be collapsed — expand for full detail
- **Raw tab** — raw calldata/signature data for manual verification

**Verify before confirming:**
- Correct function being called
- Correct token/asset addresses
- Correct amounts (watch decimals — e.g. USDC uses 6 decimals, so 1 USDC = 1,000,000)
- Correct recipient/`onBehalfOf` address
- Correct network
- Gas estimation succeeded (if it shows the tx would revert, investigate before confirming)

### 7. Confirm or reject

- **Confirm** if everything matches the intended action
- **Reject** if anything looks wrong, and inform the user
- **Ask the user** if uncertain about any detail

### 8. Switch back & verify

After confirming, switch back to the dapp tab and verify the result:
- Success toast/notification
- Updated balances or positions
- Transaction hash (link to block explorer if available)

**Never assume success** — always check actual state changes on the dapp.

## Gotchas

- **Auto-lock is real.** The wallet locks after inactivity. Always check lock state before attempting to confirm a transaction. If you get an "Invalid Password" error, the wallet may have locked between actions — just unlock again.
- **Full-tab mode only.** Chrome sidepanels are not accessible via CDP. Always open the extension URL in a regular tab.
- **Always switch the active tab.** The user monitors progress by watching the browser. If you're working in a background tab, the user sees nothing. Switch to the tab you're interacting with.
- **Decimals vary by token.** ETH/WETH = 18 decimals, USDC/USDT = 6 decimals, DAI = 18. Always verify amounts accounting for the token's decimals.
- **Gas estimation failure = likely revert.** If WalletChan shows the transaction would revert, do NOT confirm. Investigate the cause first.
- **Tenderly simulation** — WalletChan has a "Simulate on Tenderly" button on the request page. Only use it when: the user asks for a simulation, the tx shows it would revert (to debug why), or something looks off and needs verification before broadcasting.
