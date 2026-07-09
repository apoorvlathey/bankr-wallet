TODO
These are all the feature requests, tasks, etc. that we need to implement to Bankr Wallet. Ensure to break yourself into subagents, plan each of the TODO below while breaking them into smaller tasks, commit frequently (use non pgp sign). Make sure to keep on creating markdown files for each new feature you implement, update existing markdown files like IMPLEMENTATION.md, etc., follow STYLING.md for consistent styles. As you finish tasks, make sure to mark them completed in this TODO.md file.
Don't push anything to github though. Make sure to auto compact your context where it makes the most sense as you are switching from one task to another (your memory can be persisted via Markdown files like this one).

---

## Chain Support Follow-Ups

- [ ] Re-check MetaMask EIP-7702 default delegate support on Robinhood Chain
      (4663). Before flipping `isEip7702Supported` to `true`, verify that the
      current `@metamask/delegation-deployments` package includes chain 4663
      and that `eth_getCode(EIP_7702_DEFAULT_DELEGATE)` on
      `https://rpc.mainnet.chain.robinhood.com` returns non-empty bytecode.
      Use `.agents/skills/walletchan-chain-research/SKILL.md` for the support
      audit.

## Portfolio API Follow-Ups

- [ ] Remove `duneSimProvider` completely from the `/api/portfolio` provider
      chain after Zerion has proven stable in production. It is currently kept
      only as a temporary rollback/fallback path for the Dune SIM migration.

## ERC-7710 / ERC-7715 Delegated Permissions

Design principle: raw ERC-7710 typed-data signing is not a dapp API. Dapps
should request delegated authority through ERC-7715 permission methods, and
WalletChan should construct and sign the ERC-7710 delegation internally after
validating the request.

Reference behavior from MetaMask:

- MetaMask rejects external `eth_signTypedData_v4` requests when
  `primaryType === "Delegation"` and `message.delegator` is one of the wallet's
  internal EOA accounts, unless the request decodes through its recognized Gator
  / Advanced Permissions flow.
- MetaMask does not accept arbitrary dapp-defined permission types for extension
  users. It gates requests against enabled/supported permission types, with the
  currently documented set including `erc20-token-allowance`,
  `erc20-token-periodic`, `erc20-token-stream`, `native-token-allowance`,
  `native-token-periodic`, `native-token-stream`, and
  `token-approval-revocation`.

### Phase 1: block raw ERC-7710 signatures

- [ ] Revisit the current generic ERC-7710 clear-signing renderer. It is useful
      for debugging, but should not be the approval UI for externally supplied
      reusable authority grants.

### Phase 3: eligibility and policy checks

- [ ] Enforce full dapp origin context, including embedded iframe origin context
      once M4 is addressed.

#### MetaMask parity backlog

- [ ] Add pair-scoped Permit2 nonce invalidation support later, likely by
      requiring explicit token/spender fields and deriving exact-calldata or
      allowed-calldata caveats rather than a broad revocation bit alone.

### Phase 7: revocation and management

- [ ] Include delegated permissions in dapp disconnect / permission review once
      the per-origin permission model lands.

### Final phase: RPC / MCP delegation migration

- [ ] Audit WalletChan RPC / MCP delegation-signature flows. Current extension
      WalletConnect rejection blocks requests that reach WalletChan, but the
      local RPC/MCP agent delegation flow currently uses raw
      `eth_signTypedData_v4` and will need migration to ERC-7715 or an
      extension-owned internal signing channel.
- [ ] Move RPC/MCP to the same internally constructed delegation model after the
      browser extension flow is stable.

### Required tests

- [ ] Raw ERC-7710 typed-data requests are rejected for injected provider and
      WalletConnect. RPC/MCP coverage is deferred to the final phase.
- [ ] Permission grants work for private-key accounts.
- [ ] Permission grants work for seed-phrase accounts.
- [ ] Bankr API and impersonator accounts reject clearly.
- [ ] Add a dedicated automation/manual harness for WalletConnect raw
      ERC-7710 typed-data blocking and MV3 service-worker restart lifecycle
      coverage.

---

## Audit Skipped For Later

Deferred from `_docs/reports/2026-06-10.md`. Revisit these together where noted so account/dapp permission behavior is designed as one coherent model.

### M3: Per-origin connection permissions

- [ ] Implement an EIP-1193-style connection permission model.
- [ ] Make `eth_accounts` return `[]` for unapproved origins.
- [ ] Make `eth_requestAccounts` open an approval prompt keyed by dapp origin.
- [ ] Persist approved origins and expose a way to revoke them.
- [ ] Coordinate this with ST9 so per-dapp account selection and account exposure use one model.

### M4: Embedded iframe request context

- [ ] Decide whether WalletChan should inject into all frames or restrict dapp requests to top frames.
- [ ] If keeping `all_frames: true`, capture and show the top-frame origin when a cross-origin iframe initiates tx/sign requests.
- [ ] Update confirmation UI copy to make embedded context clear, e.g. "iframe.example embedded in app.example".

### ST9: Per-dapp account switching/session behavior

- [ ] Revisit tab/dapp account selection with the planned request-accounts approval flow.
- [ ] Avoid treating `tabAccounts` session storage alone as the fix; sidepanel/global account switching still changes the user-visible behavior across tabs.
- [ ] Define expected behavior for popup, sidepanel, WalletConnect, and injected dapp requests before changing storage.

---

## Task 5.3: Signature Request Decoding

### 5.3.1 EIP-712 Typed Data (signTypedData_v4)

- [ ] Trigger a signTypedData_v4 request from a dapp (e.g., permit signature)
- [ ] Verify: Structured/Raw tab toggle is visible
- [ ] "Structured" tab: domain section (name, version, chainId, verifyingContract)
- [ ] Verify: verifyingContract shows address label if available
- [ ] Verify: primary type is highlighted
- [ ] Verify: message fields displayed as key-value pairs
- [ ] "Raw" tab: shows raw JSON

### 5.3.2 Personal Sign

- [ ] Trigger a personal_sign request
- [ ] Verify: decoded message text is shown
- [ ] Verify: raw hex data section exists

---
