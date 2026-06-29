TODO
These are all the feature requests, tasks, etc. that we need to implement to Bankr Wallet. Ensure to break yourself into subagents, plan each of the TODO below while breaking them into smaller tasks, commit frequently (use non pgp sign). Make sure to keep on creating markdown files for each new feature you implement, update existing markdown files like IMPLEMENTATION.md, etc., follow STYLING.md for consistent styles. As you finish tasks, make sure to mark them completed in this TODO.md file.
Don't push anything to github though. Make sure to auto compact your context where it makes the most sense as you are switching from one task to another (your memory can be persisted via Markdown files like this one).

---

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

- [x] Reject external `eth_signTypedData_v3` / `eth_signTypedData_v4` requests
      whose typed data matches the ERC-7710 `Delegation` schema.
- [x] Apply the block to injected-provider signature requests.
- [x] Apply the block to WalletConnect signature requests.
- [x] Add confirm-time defense for any persisted raw ERC-7710 signature request
      created before the enqueue-time guard.
- [x] Keep an internal-only delegation signing path for WalletChan-generated
      permission grants; do not expose it to webpages.
- [x] Return a clear provider error, e.g. "Use
      wallet_requestExecutionPermissions for delegated permissions. Raw
      delegation signatures are not supported."
- [ ] Revisit the current generic ERC-7710 clear-signing renderer. It is useful
      for debugging, but should not be the approval UI for externally supplied
      reusable authority grants.

### Phase 2: implement ERC-7715 provider methods

- [x] Add `wallet_getSupportedExecutionPermissions`.
- [x] Add `wallet_getGrantedExecutionPermissions` scoped to active grants for
      the requesting origin/account/chain.
- [x] Expose `wallet_requestExecutionPermissions` through the provider and
      WalletConnect, enqueue a confirmation prompt, and return signed
      permission contexts after approval.
- [x] Add a first revoke method / UI after grants exist. Current support is
      local grant revocation; onchain DelegationManager disable remains in
      Phase 7.
- [x] Route these methods through focused background handlers, e.g.
      `erc7715PermissionHandlers.ts`, keeping `background.ts` as a router.
- [x] Add injected-provider and content-script bridge support for the new RPC
      methods.
- [x] Add WalletConnect proposal allowlisting and request handling for the new
      RPC methods.
- [x] Add a website test-page section for supported permissions, request
      permissions, list granted permissions, and raw ERC-7710 rejection.

### Phase 3: eligibility and policy checks

- [x] Add request preflight that allows only local signing accounts:
      `privateKey` and `seedPhrase`.
- [x] Reject Bankr API accounts unless Bankr explicitly supports this delegated
      permission model.
- [x] Reject impersonator/view-only accounts.
- [x] Before accepting a permission request, read `eth_getCode(activeEOA)` and
      require the EOA to be EIP-7702-authorized to WalletChan's default
      MetaMask DeleGator contract (`EIP_7702_DEFAULT_DELEGATE`).
- [x] If the EOA is not delegated, or delegated to another contract, reject the
      ERC-7715 request. Do not silently set or replace EIP-7702 delegation from
      a permission request; users should do that through the existing smart
      account setup / settings flow.
- [x] Enforce active-chain support and reject unsupported chain IDs.
- [x] Enforce request `from` / active account consistency.
- [x] For WalletConnect, resolve the session-authorized account before
      preflight/listing so delegated permissions do not depend on mutable popup
      active-account state.
- [x] For injected-provider ERC-7715 methods, resolve the sender tab account
      before preflight/listing so permission grants cannot drift to a different
      global popup account.
- [ ] Enforce full dapp origin context, including embedded iframe origin context
      once M4 is addressed.
- [x] Block or queue concurrent `wallet_requestExecutionPermissions` requests
      while one approval is pending, matching MetaMask's EIP-7715 blocking
      middleware behavior.
- [x] Make the concurrent-request block authoritative after MV3 service-worker
      restarts by deriving it from unexpired
      `pendingErc7715PermissionRequests`, and apply the background block to all
      external provider RPC routes that can reach the service worker.

### Phase 4: supported permission vocabulary

- [x] Start with a fixed allowlist. Do not accept arbitrary dapp-defined
      permission types.
- [x] Current set: `erc20-token-allowance`, `erc20-token-periodic`,
      `erc20-token-stream`, `native-token-allowance`,
      `native-token-periodic`, `native-token-stream`, and
      `token-approval-revocation`.
- [x] Identify MetaMask's broader Advanced Permissions set for a later phase.
      MetaMask gates the extension build / remote feature flag against:
      `native-token-allowance`, `native-token-periodic`,
      `native-token-stream`, `erc20-token-allowance`,
      `erc20-token-periodic`, `erc20-token-stream`, and
      `token-approval-revocation`.
- [x] For each supported type, define a WalletChan-owned mapping from the
      ERC-7715 permission object to known MetaMask DeleGator caveat enforcers
      and terms.
- [x] Reject unknown permission types, unsupported rule shapes, unbounded
      amounts, malformed tokens, unexpected data fields, and impossible expiry /
      time-window values.
- [x] Reject unknown caveat enforcers once WalletChan's permission-to-caveat
      mapping exists. The ERC-7715 path does not accept dapp-supplied enforcer
      addresses; it derives only WalletChan-owned caveats from
      `erc7715PermissionCaveats.ts`.
- [x] Store the supported-permission registry in code and use it for both
      validation and `wallet_getSupportedExecutionPermissions`.
- [x] Initial implementation accepts one ERC-7715 permission request per RPC
      call. Multi-request approval batches are intentionally rejected until the
      UI can display and attenuate multiple delegations clearly.

#### MetaMask parity backlog

- [x] Add `native-token-periodic`.
      Data shape should mirror ERC-20 periodic without `tokenAddress`:
      `periodAmount`, `periodDuration`, `startTime`, plus expiry rules. Requires
      a WalletChan-owned mapping to the correct native periodic DeleGator caveat
      enforcer before the type is exposed by
      `wallet_getSupportedExecutionPermissions`. Implemented with MetaMask
      DeleGator v1.3.0 `NativeTokenPeriodTransferEnforcer` and test-page
      fixture coverage.
- [x] Add `native-token-stream`.
      Expected data includes `initialAmount?`, `maxAmount?`,
      `amountPerSecond`, and `startTime`, plus expiry rules. UI should show
      stream rate, available per day, max allowance / unlimited state, total
      exposure when bounded, start time, expiry, and justification. Implemented
      with MetaMask DeleGator v1.3.0 `NativeTokenStreamingEnforcer`.
      WalletChan requires an expiry for all streams, so dapps cannot request an
      implicitly perpetual stream and the upstream enforcer's elapsed-time
      multiplication stays bounded.
- [x] Add `erc20-token-stream`.
      Expected data includes `tokenAddress`, `initialAmount?`, `maxAmount?`,
      `amountPerSecond`, and `startTime`, plus expiry rules. Reuse token-logo,
      balance, USD value, address copy/explorer, and stream exposure UI from
      the current ERC-7715 permission surfaces. Implemented with MetaMask
      DeleGator v1.3.0 `ERC20StreamingEnforcer`; WalletChan applies the same
      finite-exposure / expiry requirement used for native streams.
- [x] Add `token-approval-revocation`.
      This is not a spending allowance. It grants authority to revoke token
      approvals. MetaMask displays enabled primitives for `erc20Approve`,
      `erc721Approve`, `erc721SetApprovalForAll`, `permit2Approve`,
      `permit2Lockdown`, and `permit2InvalidateNonces`. WalletChan should only
      enable it after mapping those primitives to known safe DeleGator caveats /
      executions and after the confirmation UI clearly distinguishes it from
      token spending. Implemented with MetaMask DeleGator v1.3.0
      `ApprovalRevocationEnforcer` plus required `NonceEnforcer`; requests must
      include an expiry, method flags are immutable in the confirmation UI, and
      Permit2 primitives require live canonical Permit2 code on a WalletChan
      built-in chain. Broad `permit2InvalidateNonces` is rejected in this phase
      because it can invalidate unrelated pending Permit2 signatures without
      exact token/spender scoping.
- [ ] Add pair-scoped Permit2 nonce invalidation support later, likely by
      requiring explicit token/spender fields and deriving exact-calldata or
      allowed-calldata caveats rather than a broad revocation bit alone.
- [x] Add test-page buttons / fixtures for each newly enabled parity type only
      after the corresponding registry validation, caveat derivation,
      confirmation UI, grant display, revoke display, and tests are in place.
      Currently complete for `native-token-periodic` and
      `native-token-stream`, `erc20-token-stream`, and
      `token-approval-revocation`.
- [x] Keep arbitrary / unknown ERC-7715 permission types rejected for dapps.
      MetaMask may bucket unknown granted permissions as `other` in management
      UI, but request handling still checks enabled supported types before
      forwarding to the permissions kernel.
- [x] Audit/fix caveat parity against MetaMask DeleGator v1.3.0: native grants
      include `ExactCalldataEnforcer(0x)`, ERC-20 grants include
      `ValueLteEnforcer(0)`, allowance grants use periodic enforcers with
      `periodDuration = uint256.max`, standard grants include `NonceEnforcer`,
      and EIP-712 signed caveats omit unsigned `args`.

### Phase 5: construct and sign WalletChan-owned delegations

- [x] Dapp submits ERC-7715 permission request; WalletChan validates it through
      the fixed allowlist and caveat mapping.
- [x] WalletChan constructs the ERC-7710 typed data itself:
      `delegator = active account`, `delegate = request.to`,
      `authority = ROOT_AUTHORITY`, `verifyingContract = canonical
      DelegationManager`, and caveats derived from the supported permission
      type.
- [x] Sign only through local PK / seed phrase signers after user approval.
- [x] Persist grant records by `origin + accountId + chainId +
      context/delegationHash`, including permission object, delegate, signed
      delegation, delegation manager, createdAt, expiry, and revoked/expired
      status.
- [x] Make `wallet_getGrantedExecutionPermissions` return only active grants
      scoped to the requesting origin/account unless there is a deliberate
      reason to expose historical entries.

### Phase 6: custom permission confirmation UI

- [x] Build a dedicated delegated-permission confirmation screen, similar in
      priority to SIWE, instead of relying on generic typed-data display.
- [x] Display the request in human terms: requesting site, account, chain,
      delegate/session account, token/native asset with live balance/USD value,
      amount, frequency/stream rate, expiry, start time, and justification.
- [x] Add controls only when `permission.isAdjustmentAllowed` is true, including
      amount, frequency for periodic permissions, start time, and expiry.
- [x] Keep raw ERC-7710 / caveat fields in an advanced details accordion for
      auditing, not as the primary review surface.
- [x] Follow `_docs/STYLING.md`: intent tokens, copy buttons for addresses, and
      explorer links for every displayed `0x` address.
- [x] Always show ERC-20 contract addresses in delegated-permission approval,
      grant, and revoke summaries even when token metadata/decimals resolve, so
      spoofed symbols or logos are not the only review signal.

### Phase 7: revocation and management

- [x] Add an account/settings view for active delegated permissions grouped by
      site, with chain/account scope visible from the selected account and each
      grant card.
- [x] Reconcile externally disabled grants by checking
      `disabledDelegations(hash)` over RPC during active grant reads, marking
      them revoked locally, removing them from the active management view, and
      keeping them out of `wallet_getGrantedExecutionPermissions`.
- [x] Add onchain revoke/disable flow. If the delegation must be disabled
      onchain, create a transaction to call the DelegationManager disable path;
      if it is already expired, mark it locally but keep history.
- [x] Add human-readable revoke transaction review. WalletChan-queued
      `disableDelegation(delegation)` txs carry a display snapshot so the
      confirmation screen shows the original site, permission type, delegate,
      asset/amount/frequency, and expiry while leaving raw calldata collapsed
      for audit.
- [ ] Include delegated permissions in dapp disconnect / permission review once
      the per-origin permission model lands.
- [x] Document storage keys and migrations before adding grant persistence.

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
- [x] `wallet_getSupportedExecutionPermissions` returns only enabled supported
      types.
- [x] `wallet_requestExecutionPermissions` rejects when the EOA is not
      delegated to WalletChan's default DeleGator contract.
- [ ] Permission grants work for private-key accounts.
- [ ] Permission grants work for seed-phrase accounts.
- [ ] Bankr API and impersonator accounts reject clearly.
- [x] `wallet_getGrantedExecutionPermissions` is origin/account/chain scoped.
- [x] `wallet_getGrantedExecutionPermissions` fails closed or removes grants
      when onchain status cannot be verified, the EOA is no longer delegated to
      WalletChan's default DeleGator, the delegation hash is disabled, or the
      stored nonce was invalidated.
- [x] WalletConnect ERC-7715 methods use the session-authorized account for
      request preflight and grant listing.
- [x] WalletConnect ERC-7715 grants are scoped by session topic
      (`walletconnect:<topic>`) rather than peer-supplied URL metadata.
- [x] Injected and WalletConnect `wallet_requestExecutionPermissions` responses
      use the persisted `erc7715PermissionResult:{id}` bridge instead of a
      long-lived MV3 response channel, so service-worker restarts do not leave a
      saved grant without a dapp response.
- [x] Test page includes injected-provider negative helpers for concurrent
      `wallet_requestExecutionPermissions`, native grants with arbitrary
      calldata, and ERC-20 grants with native value.
- [ ] Add a dedicated automation/manual harness for WalletConnect raw
      ERC-7710 typed-data blocking and MV3 service-worker restart lifecycle
      coverage.
- [x] Confirmation UI renders all supported permission types without relying on
      raw typed-data readability.
- [x] Onchain revoke queues a DelegationManager `disableDelegation` tx and
      marks the grant revoked locally only after a successful receipt.
- [x] Externally disabled grants are detected by
      `disabledDelegations(hash)` during Account Settings and
      `wallet_getGrantedExecutionPermissions` reads.
- [x] Test page has a dedicated Delegations section with supported/granted
      queries, all currently supported request types, raw ERC-7710 rejection
      coverage, malformed/ambiguous/no-expiry/Permit2-nonce-invalidation
      negative cases, and a helper to inspect/copy/consume returned contexts.

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
