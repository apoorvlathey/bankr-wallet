TODO
These are all the feature requests, tasks, etc. that we need to implement to Bankr Wallet. Ensure to break yourself into subagents, plan each of the TODO below while breaking them into smaller tasks, commit frequently (use non pgp sign). Make sure to keep on creating markdown files for each new feature you implement, update existing markdown files like IMPLEMENTATION.md, etc., follow STYLING.md for consistent styles. As you finish tasks, make sure to mark them completed in this TODO.md file.
Don't push anything to github though. Make sure to auto compact your context where it makes the most sense as you are switching from one task to another (your memory can be persisted via Markdown files like this one).

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
