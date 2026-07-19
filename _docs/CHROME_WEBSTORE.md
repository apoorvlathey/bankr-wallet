# Chrome Web Store Publishing Guide

This document contains all the information required for the Chrome Web Store Privacy practices tab.
Media assets are available in `./chrome-webstore/`

---

## Single Purpose Description

**What does your extension do?**

WalletChan is a Chrome extension that provides an interface to connect BankrBot API wallets to web3 apps and send transaction requests on supported EVM chains (Base, Ethereum, Polygon, Unichain). It works by injecting a Web3 provider into web pages like any other standard wallet.

---

## Permission Justifications

### 1. activeTab

**Justification:**

It enables our extension to:

1. Detect which dApp the user is currently visiting
2. Display the correct favicon and origin in transaction confirmation dialogs
3. Communicate with the content script to set the wallet address and chain ID for the active tab
4. Position the transaction confirmation popup relative to the current browser window

The extension only accesses the active tab when explicitly invoked by the user through clicking the extension icon or when a dApp initiates a transaction request.

---

### 2. storage

**Justification:**

The storage permission is essential for the extension to function. It is used to store:

1. Encrypted API Key: The user's Bankr API key is encrypted with AES-256-GCM using a password-derived key (PBKDF2 with 600,000 iterations) and stored securely in `chrome.storage.local`.

2. Wallet Address: The user's impersonated wallet address is stored in `chrome.storage.sync`.

3. Network Configuration: Custom RPC endpoints and network settings are stored in `chrome.storage.local`.

4. Pending Transactions: Transaction requests from dApps are stored persistently so they survive popup closes and browser restarts. This prevents data loss if the user accidentally closes the popup before confirming.

5. Transaction History: Completed transactions (up to 50 entries) are stored for user reference.

6. User Preferences: Settings like auto-lock timeout, side panel mode preference, and selected network are stored.

---

### 3. sidePanel

**Justification:**

The sidePanel permission enables the extension to open in Chrome's built-in side panel (Chrome 114+) as an alternative to the traditional popup. This provides a better user experience because:

1. Persistent View: Unlike popups that close when clicking outside, the side panel remains open while users interact with dApps, allowing them to review and confirm multiple transactions without repeatedly reopening the extension.

2. More Screen Space: The side panel provides more vertical space for displaying transaction details, signature requests, and transaction history.

3. Multi-Transaction Workflow: When interacting with complex dApps that require multiple transactions, users can keep the side panel open and confirm transactions sequentially without interruption.

The extension defaults to popup mode and only enables side panel mode after verifying it works correctly in the user's browser (some browsers like Arc have broken side panel implementations).

---

### 4. notifications

**Justification:**

The notifications permission is used to alert users about the status of their blockchain transactions after they close the extension popup or sidepanel. Specifically:

1. Transaction Confirmed: When a transaction is successfully confirmed on the blockchain, a notification is shown with the message "Your transaction on {chainName} was successful".

2. Transaction Failed: When a transaction fails, a notification is shown with the error message so users are aware of the failure even if they're not actively viewing the extension.

This is essential for user experience because blockchain transactions can take from a few seconds to several minutes to confirm. Users should not be required to keep the extension open while waiting for confirmation.

---

### 4b. offscreen

**Justification:**

The offscreen permission is used only for Ledger hardware-wallet operations. After the user explicitly grants a Ledger device through Chrome's WebHID chooser, WalletChan creates a packaged offscreen document to keep the Ledger transport alive while the popup closes or the user reviews and approves a transaction on the device. The document receives only public derivation paths and unsigned transaction/message data, returns a signature, and is closed after an idle timeout. It does not capture the page, execute remote code, or receive private keys.

---

### 5. tabs

**Justification:**

The tabs permission is used for two specific purposes:

1. Onboarding Tab Management: When the extension is first installed, it opens an onboarding page in a new tab. When the user completes onboarding and opens the extension popup, the onboarding tab is automatically closed to avoid leaving unused tabs. This requires the ability to query for tabs with the extension's URL pattern and close them.

2. Tab-Specific Chain State: Each browser tab maintains its own selected blockchain network. When the user switches between tabs, the extension queries the active tab to update the network dropdown to reflect that tab's chain selection. This ensures the UI always shows the correct network for the current dApp.

The extension does not read tab content, URLs, or any sensitive information. It only uses the tabs API for the specific purposes listed above.

---

### 6. Host Permissions (https://_/_ and http://_/_)

**Justification:**

WalletChan is a Web3 wallet that must work on any website with dApp functionality. Specifically:

1. Content Script Injection: Bridges communication between dApps and the extension. Standard practice for all Web3 wallets.

2. Web3 Provider Injection: Provides `window.ethereum` and announces via EIP-6963 for wallet discovery.

3. RPC Proxy: Proxies blockchain calls through background worker to bypass strict Content Security Policies.

4. Transaction Interception: Intercepts `eth_sendTransaction` to show confirmation dialogs before submission.

Without broad host permissions, the wallet would be unusable on most dApps.

---

### 7. Remote Code

**Justification:**

The extension does NOT use remote code execution. All JavaScript code is bundled at build time and included in the extension package.

The extension does make network requests to:

1. Bankr API (`api.bankr.bot`): To submit transactions and poll for their completion status
2. Blockchain RPC endpoints: To read blockchain state (balances, contract data, etc.)
3. eth.sh API: To fetch address labels for display in the UI
4. Google Favicons API: To display website favicons in the transaction confirmation dialog

None of these requests involve downloading or executing code. They are purely data fetching operations using standard fetch/HTTP requests.

---

### 8. declarativeNetRequestWithHostAccess

**Justification:**

Used solely to power the ENS Browsing feature (the `*.eth` address-bar feature added in v3.9.0). Two rule types are registered:

1. HTTPS-upgrade exemption for `*.ipfs.localhost`: Chrome auto-rewrites http:// to https://, which breaks local IPFS / Kubo gateways running on 127.0.0.1. A static rule disables the upgrade only for that hostname.

2. ENS gateway interception: `*.eth.limo`, `*.eth.link`, and (in local-pin mode) `*.w3eth.io` requests are redirected through the extension's resolver so users land on the correct gateway — public eth.limo / w3eth.io, or a local Kubo node if configured. A per-tab session-scoped ALLOW rule lets the in-page banner's "Open on gateway" action bypass the redirect on one click.

The extension does NOT block ads, modify third-party headers, or read response bodies. All rules are scoped to ENS Browsing and are removed when the user disables it in Settings.

---

### 9. unlimitedStorage

**Justification:**

WalletChan needs `unlimitedStorage` because it is a crypto wallet that must reliably persist encrypted wallet vault metadata, pending transaction/signature requests, WalletConnect request routing, transaction result records, user-added accounts, custom networks, and transaction history. It also maintains optional public metadata caches for token details, logos, clear-signing descriptors, and ENS/avatar display so users can safely review transactions. Without `unlimitedStorage`, normal wallet activity across many tokens and dApps can exhaust Chrome's default extension storage quota and cause critical wallet writes to fail, including saving a pending transaction, returning a confirmation result to a dApp, or updating encrypted vault/account state. The permission is only used for this extension's own `chrome.storage.local` data. It is not used to read browsing history, page contents, or files, and non-critical caches are best-effort and pruned regularly.

---

## Privacy Policy URL

https://github.com/apoorvlathey/walletchan/blob/master/PRIVACY_POLICY.md

---

## Content Scripts Justification

The extension uses content scripts (`inject.js`) that run on all web pages (`<all_urls>`) because:

1. Web3 wallets must be available on any website that implements dApp functionality
2. The script bridges communication between the page's Web3 provider and the extension
3. This is the standard architecture used by all major Web3 wallets (MetaMask, Coinbase Wallet, Rainbow, etc.)

The content script only:

- Listens for Web3-related messages from the page
- Forwards wallet requests to the background service worker
- Returns responses back to the page
- Does NOT read page content, DOM, or any user data

---

## Web Accessible Resources

The extension exposes `static/js/inpage.js` as a web accessible resource so it can be injected into page contexts. This script:

1. Creates the `window.ethereum` Web3 provider object
2. Announces the wallet via EIP-6963 for wallet discovery
3. Intercepts wallet method calls (like `eth_sendTransaction`)
4. Communicates with the content script via `postMessage`

This is required for dApps to detect and interact with the wallet.

---

## Additional Notes for Review

1. **Open Source**: The extension source code is available at the repository linked in the extension listing.

2. **No Monetization**: The extension does not contain ads, in-app purchases, or any form of monetization.

3. **Security**: API keys are encrypted with AES-256-GCM with PBKDF2 key derivation (600,000 iterations). The password is never stored, only used to derive encryption keys.

4. **Limited Chain Support**: The extension only supports 4 blockchain networks (Base, Ethereum, Polygon, Unichain) to reduce attack surface and ensure transaction safety.
