# Changelog

All notable changes to the **WalletChan browser extension** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This changelog tracks the **extension only** (`apps/extension/` + shared packages it consumes). Indexer, bot, contract, and website changes are not listed here unless they affect what users see in the extension.

To regenerate the `[Unreleased]` section from git diffs, invoke the `/changelog` skill.

## [Unreleased]

_Nothing yet._

## [4.0.0] - 2026-07-27

### Added

- **Biometric/passkey unlock.** A local WebAuthn PRF credential can unlock
  WalletChan without storing the master password, including before Bankr API,
  Private Key, Seed Phrase, and Ledger signing. Timed and Never sessions,
  automatic unlock prompts, and passwordless local-account setup are included.
- **Origin-bound dapp connections.** `eth_requestAccounts` now opens an explicit
  approval where users choose the accounts shared with a site. A new home dapp
  dock shows the active site, its assigned account and network, and disconnect
  controls, while per-tab routing prevents one site's selection from leaking
  into another.
- **Interaction sounds.** Optional sound cues now cover navigation, sheets,
  confirmations, portfolio interactions, and transaction outcomes, with a
  Settings toggle and an audible preview when enabled.
- **Address book.** Users can add, edit, delete, search, and reorder named
  contacts with name-service identities and avatars, then reuse those contacts
  directly from Send recipient discovery.
- **Portfolio display controls.** New synced preferences can combine the same
  asset across networks and automatically follow the connected dapp's network.
- **Saved RPC endpoints.** Chain settings can keep multiple named RPC endpoints,
  switch between them, edit provider labels, show provider favicons, and accept
  local-development URL shorthand.
- **Developer RPC impersonation.** A per-endpoint developer switch can forward
  reviewed unsigned transactions and swaps from view-only accounts to an
  explicitly enabled local custom RPC; the wallet never signs for the
  impersonated address.
- **Expanded built-in network catalog.** Abstract, Avalanche, Berachain, Blast,
  HyperEVM, Ink, Linea, Mantle, Mode, Monad, Plasma, Scroll, Sonic, Tempo,
  World Chain, and ZKsync Era are now built in, alongside 26 native
  hidden-by-default testnet entries that inherit their mainnet identity. Chain
  capabilities were refreshed across the catalog, including EIP-7702 support
  on Robinhood Chain.
- **Expanded dapp3 Browser.** The browser can search a dapp directory,
  open ordinary HTTPS sites, manage connected dapps, save and reorder favorites,
  promote recently resolved sites, and show when an ENS contenthash was last
  updated.
- **Arbitrum force inclusion.** Eligible Arbitrum transactions can use the
  delayed inbox and track the L1 delivery through optional sequencer force
  inclusion from the normal review and Activity surfaces.
- **Token-funded network fees.** Eligible Bankr API, Private Key, and Seed Phrase
  accounts can pay gas with supported ERC-20 tokens through reviewed Pimlico
  quotes for transactions, batches, swaps, and Safe execution. Ledger remains
  native-gas-only.
- **Ledger hardware wallets.** Users can connect over Chrome WebHID, browse
  derivation paths and addresses, import Ledger accounts, and approve
  transactions or messages on-device without private keys entering the
  extension. Ledger accounts can also approve supported WalletConnect sessions
  for single transactions, personal messages, and validated EIP-712 requests.
- **Pending transaction controls.** Activity can prepare reviewed Speed Up and
  Cancel replacements for the oldest pending Private Key, Seed Phrase, and
  Ledger transaction. These account types can also review or edit the address
  nonce before signing.
- **Safe multisig accounts.** WalletChan can discover and import verified Safe
  accounts owned by Bankr API, Private Key, Seed Phrase, or Ledger accounts,
  surface pending proposals, collect owner approvals, execute at quorum, create
  canonical rejection proposals, and use Safe-aware Send, Swap, Activity, and
  security views across supported networks. One Safe account can enable and
  manage verified deployments across multiple chains. Ledger owners approve
  on-device and may execute with native gas; token-funded Safe execution
  remains unavailable for Ledger.
- **Approval safety and cleanup.** Transaction previews recognize ERC-20 and
  Permit2 approval intent, detect supported residual approvals after reviewed
  flows, and offer evidence-bound revocation. Private Key and Seed Phrase
  accounts can add verified cleanup calls to eligible atomic batches, while
  unsigned Safe proposals can append canonical revocations before signing.
- **Dapp reputation checks.** New connection prompts identify trusted custom
  domains and exact DeFiLlama listings, warn when reputation coverage is
  unavailable or a site is unlisted, and require an explicit acknowledgement
  for blocklisted or lookalike domains.
- **In-wallet WCHAN staking.** Users can stake and unstake WCHAN on Base, claim
  WETH rewards, review the live APY and seven-day fee window, and batch approval
  plus deposit when supported. All four signing wallet types are supported;
  view-only accounts can inspect balances without submitting actions.
- **Private wallet powered by Privacy Pools.** All four signing account
  types—Bankr API, Private Key, Seed Phrase, and Ledger—can Shield Ethereum ETH
  into a private portfolio and Unshield through a private relayer, a
  recipient-paid transaction, or public recovery. The flow includes proof and
  compliance progress, private Activity, partial withdrawals, recipient account
  creation, and master-gated recovery backup and restore; Ledger approvals stay
  on-device and view-only accounts cannot submit privacy mutations.

### Changed

- WalletChan browser-extension releases beginning with v4 are licensed under
  GPL-3.0-only. Packaged builds include the full license, exact corresponding
  source directions, and attribution for the bundled `snarkjs@0.7.5` prover.
- The extension has an end-to-end Warm Midnight visual overhaul across Home,
  assets, account controls, Settings, action sheets, request surfaces, and
  fullscreen/sidepanel layouts, with a responsive animated mascot and shared
  screen, picker, field, and action primitives.
- Transaction, batch, signature, and ERC-7715 permission reviews now lead with
  plain-language intent, dapp and signer identity, estimated asset changes, and
  sticky decision controls, while technical payloads, calldata, nonce, gas,
  force-inclusion, and Tenderly tools move into clearer advanced disclosures.
- Send and Swap/Bridge use compact amount cards, percentage sliders, shared
  searchable network and token pickers, improved recipient discovery, richer
  contract-recipient warnings, and a dedicated final review with pinned signer
  and fee controls.
- Activity is now a dated, chain-aware ledger with clearer dapp, contact, Safe,
  bridge, privacy, replacement, and status identities. History is paginated,
  large datasets load progressively, and transaction details are resolved only
  when opened.
- Onboarding, Add Account, account selection, account settings, and chain/token
  management now use dedicated full-screen flows with clearer security gates,
  searchable Settings, and a streamlined Quick Actions hub.
- Store packages now use the “WalletChan - Web3 Wallet” product name, expanded
  extension descriptions, and `walletchan.com` as the Chrome homepage.
- Large portfolios now render and verify holdings progressively, keep active
  balances and charts stable during refreshes, and prioritize funded networks
  and relevant assets in selectors.
- Security settings now place Auto-Lock immediately after Change Password and Agent Password at the bottom.
- New and changed passwords now require at least 8 characters and reject a
  small set of obviously guessable values; existing legacy passwords remain
  unlockable.
- Missing or invalid auto-lock settings now use a finite 15-minute default.
  An existing explicit Never selection remains unchanged.
- Signature approvals no longer show a redundant success toast after the
  request has already completed.

### Fixed

- Safe accounts can create, sign, and publish approvals for a queued
  future-nonce transaction while an earlier request is pending; only fee
  estimation and final execution wait for the nonce to become current. A fully
  signed queued request now becomes executable immediately after the preceding
  nonce confirms instead of remaining stuck on “Waiting for owners.”
- Ordered Bankr swap submissions stop after a failed, reverted, or
  outcome-unknown leg instead of continuing with later transactions.
- Native-token MAX sends reserve a conservative network fee instead of trying
  to transfer the account's entire balance.
- Swap selectors now stay aligned with actual 0x support and immediately show
  the selected sell asset while its catalog and onchain data refresh.
- Dapp-requested network additions once again return through the injected
  provider correctly, including when re-enabling an existing hidden chain.
- Permit2 clear-signing summaries now format reviewed token amounts with the
  token's runtime decimals and symbol instead of presenting raw integer units.
- Reused account pickers no longer snap the scroll position back to the active
  account while the user browses other entries.
- Sidepanel request handling now works reliably in Brave, keeps short viewports
  usable, opens fullscreen transaction and connection requests in the selected
  sidepanel mode, and restores the popup when leaving sidepanel mode.
- RPC issue notices wait for persistent failures and use a compact layout,
  reducing warnings caused by brief rate limits or refresh races.
- Long random SIWE nonces are no longer mislabeled as weak while short,
  patterned, and low-entropy values still trigger a warning.
- DeFi protocol artwork and chain-switch notification icons now render through
  safe raster fallbacks instead of disappearing on unsupported image formats.
- Rejecting a pending transaction returns Home to Activity instead of the wrong
  tab, and account/settings back navigation preserves its intended destination.

### Security

- Passkey payloads and stored wrappers now fail closed on malformed cryptographic sizes, stale WebAuthn ceremonies cannot overwrite newer auth state, and auth mutations/session restoration are serialized so lock, password rotation, reset, and factor changes win deterministically.
- Passkey unlock hydrates the vault-key-backed Bankr API, Private Key, and Seed
  Phrase credential caches without storing the master password or exposing
  WebAuthn-derived material outside extension pages.
- Key/phrase reveal and account/permission mutations now recheck the exact
  master session and pinned account at the final effect boundary; pending dapp
  and WalletConnect work is origin-, account-, chain-, and lifecycle-bound.
- Dapp connection, provider, and WalletConnect requests now derive authority
  from the browser sender, enforce exact origin/account/chain bindings, and keep
  impersonator prompts reject-only unless the user explicitly enables a local
  developer RPC endpoint.
- Dapp reputation lookups resolve the browser-attested hostname from the
  durable pending request, use bounded credential-free transports, preserve
  blocklist and lookalike precedence over trusted-domain signals, and never
  grant connection or signing authority.
- WalletConnect diagnostic telemetry and its persistent telemetry identifier
  are disabled while pairing, relay delivery, and session keepalive continue
  as functional transport.
- Bankr batch and swap execution binds the exact account and credential
  generation before validation, then rechecks that binding before submission.
- WalletConnect reset rotates its SDK storage identity, browser fallbacks
  without native session storage no longer persist Never-session password
  recovery material, and stale fallback ciphertext/key halves are removed if a
  later browser upgrade gains native session storage without disrupting a
  valid current native session. Ambiguous sponsored ERC-3009 transfers retain one
  encrypted authorization and require finalized dual-RPC reconciliation plus
  trusted-UI result acknowledgment before another transfer is allowed.
- Bankr/API/RPC responses, external navigation, and remote images now use
  stricter origin, redirect, size, timeout, and raster-only boundaries.
- Removing the final account backed by a seed phrase now requires an explicit
  warning, while agent-password sessions remain blocked from private-key,
  mnemonic, passkey-recovery, and Privacy Pools recovery disclosure.


## [3.19.0] - 2026-07-08

### Added

- **Robinhood chain support.** WalletChan now includes Robinhood as a built-in chain with chain metadata, icon support, and swap API routing.
- **GNS clear-signing descriptors.** Transaction review now renders clearer summaries for GNS calls, including resolver-aware labels and content-hash formatting.

### Fixed

- Custom-chain add flows now propagate successful `wallet_addEthereumChain` requests back through the injected provider more reliably.
- ERC-7715 permission requests now normalize relaxed EVM address input and edited permission data consistently before preflight and caveat generation.

### Security

- ERC-7715 delegated-permission validation now rejects ambiguous extras and revalidates edited terms before signing WalletChan-owned delegation data.

## [3.18.0] - 2026-06-30

### Added

- **ERC-7715 delegated permissions.** Dapps and WalletConnect sessions can now request delegated permission grants with review, editable terms, pending-request handling, activity details, and revoke summaries.
- **Gwei name support.** WalletChan now resolves `.gwei` names across address fields, confirmations, and transaction history.
- **Gwei dapp3 Browser support.** The dapp3 Browser can now open `.gwei` IPFS/IPNS sites and shared `*.gwei.domains` links, alongside existing `.eth` browsing.
- Account Settings now shows delegated permission grants and lets users review or revoke existing delegations.

### Changed

- Portfolio loading now uses a holdings cache and tighter non-critical metadata pruning, reducing repeated RPC/API work while keeping recently received tokens visible.
- Swap and transfer token selectors delay logo requests until needed, reducing eager network work for large token lists.
- Batch and swap confirmation call lists use a cleaner compact layout without the accent stripe.

### Fixed

- `.gwei` browser resolution refreshes GNS records directly before opening gateway content instead of relying on stale ENS cache checks.

### Security

- ERC-7715 permission requests now run preflight checks for the requesting account, delegate, supported permission/rule set, and local signing context before a grant can be approved.

## [3.17.0] - 2026-06-17

### Added

- Seed phrase imports can now coexist with view-only impersonator entries for the same address, so users can import or derive the real signing account without removing the viewer first.
- Single-transaction confirmations now have a reject-capable fallback screen for malformed pending requests, preventing bad dapp payloads from blanking the popup.

### Changed

- Non-critical metadata caches now request more browser storage headroom and prune stale token, avatar, clear-signing, CoinGecko, and swap-token cache entries before they can crowd out wallet-critical writes.
- Private Key and Seed Phrase multi-transaction broadcasts now submit local transactions sequentially and stop on the first failure, reducing the chance that later nonce transactions execute after a bundle appears to fail.

### Fixed

- Bankr API account address rotation now updates the account record, synced active address, and connected dapps after changing the API key and address.
- Seed phrase imports no longer persist duplicate encrypted seed material when selected derived addresses are already present.
- Native value handling is safer across injected dapp requests, WalletConnect, ERC-5792 batches, cross-dapp batches, swap confirmations, and transaction review: malformed values are rejected, precision is preserved, native symbols match the source chain, and reviewed native amounts remain intact.
- Cross-dapp EIP-7702 batches now include the required authorization gas bump when a local account needs first-time delegation.
- Pending requests, WalletConnect state, custom tokens, transaction history, and custom network settings now use locked storage writes so overlapping updates do not drop requests or overwrite edits.
- Wallet reset now clears extension state more completely, including pending requests, WalletConnect sessions, cached metadata, and local account artifacts.
- Settings flows that require unlock now return to the requested settings pane after authentication.
- ENS hosted-gateway pages no longer get stuck in a reload loop while normalizing URLs.
- Swap confirmations no longer crash from decoded calldata label updates, and calldata/value rows now show the correct labels and native asset symbol.
- Approval and asset-change explorer links now use the resolved chain explorer instead of falling back to the wrong network.
- Legacy password changes now re-encrypt API-key, private-key, and seed-phrase vault data in one storage update.
- Partial auth cleanup no longer leaves mismatched cached credentials after errors or lock operations.

### Security

- Auto-lock now expires the cached vault key and password type, so the locked state consistently blocks Bankr API, Private Key, and Seed Phrase signing.
- Background handlers intended only for the extension UI are now gated from content-script senders, including chat, account/settings mutations, transaction cancellation, and history/conversation reads.
- SIWE review now binds the displayed prompt to the trusted requesting origin and keeps domain/signature validation aligned with the actual dapp sender.
- Bankr submit responses are validated before transactions are treated as accepted.
- Legacy API-key writes are blocked once vault-key storage is active, preventing stale password-encrypted key material from being recreated.
- Unsupported raw-hash `eth_sign` signing paths stay rejected across Bankr API, Private Key, and Seed Phrase accounts.


## [3.16.0] - 2026-05-31

### Added

- **WalletConnect relay keepalive.** Active WalletConnect sessions now keep polling the relay from the background service worker, so dapp transaction and signature requests arrive without waiting for the popup or sidepanel to be opened.

### Changed

- WalletConnect pairing now strips whitespace from pasted URIs, so copied QR payloads with spaces or line breaks connect correctly.
- Opening WalletChan in fullscreen from the sidepanel now closes the sidepanel when supported, including from the locked screen, avoiding duplicate extension surfaces.
- Custom-chain delete confirmation uses a centered, compact themed dialog.

### Fixed

- ERC-7730 clear-signing native `amount` fields now render human-readable native token amounts using the active chain's decimals instead of raw integer values.


## [3.15.0] - 2026-05-29

### Added

- **WalletConnect bridge.** More -> WalletConnect now lets users pair WalletChan with WalletConnect dapps, manage active sessions, and route transactions, signatures, chain switches, read-only RPC calls, and ERC-5792 batch requests through the same confirmation flow used by injected dapps.
- **dapp3 Browser.** More -> dapp3 Browser opens a WalletChan extension page for `.eth` names, raw ERC-4804 `0x` addresses, and pasted gateway URLs, with favorite dapps and recently cached dapps.
- **More Actions hub.** The popup now has a dedicated More screen for secondary actions, including WalletConnect, dapp3 Browser, token hiding, and external WalletChan links.
- **Portfolio token hiding.** Users can hide ERC-20 tokens from Holdings, manage hidden tokens from More -> Hide Tokens, and keep hidden tokens out of visible totals, Send/Swap holdings, and new portfolio snapshots.
- **Native calldata preview in Send.** Native-token sends with custom calldata can now be decoded before the transaction is created, using the clear-signing view plus the raw calldata decoder.
- Settings now shows the installed extension version.

### Changed

- Portfolio refreshes now prioritize tokens received by recent confirmed transactions and avoid unnecessary refresh work for collapsed low-value groups, reducing popup RPC load while keeping new balances visible.
- Chain selector labels fit more reliably in compact account/network controls.

### Fixed

- Private Key and Seed Phrase EIP-7702 atomic batches now keep native value in the encoded inner calls while signing the outer EOA self-call with `value: 0x0`, avoiding redundant native self-sends and incorrect gas/Tenderly values.
- Batch gas estimates and insufficient-balance checks still include the reviewed inner native values after the EIP-7702 outer-value fix.


## [3.14.0] - 2026-05-28

### Added

- **SIWE review for signature requests.** Sign-In with Ethereum messages now render as a structured review with site, account, chain, URI, nonce, timing, resources, copy/explorer actions, and validation warnings. Blocking SIWE errors such as domain, signer, chain, expiry, or format mismatches require an explicit override before signing.
- **Dapp RPC read forwarding.** WalletChan can discover page-local JSON-RPC URLs and use them for a narrow allowlist of non-critical read methods after `eth_chainId` validation, with fallback to the extension-controlled RPC path.
- **Dapp chain-switch notifications.** When a site switches WalletChan to another supported chain, users get a cooldown-protected browser notification with the target chain.
- **Expanded ERC-7730 clear-signing coverage.** Clear signing now supports more descriptor formats and guards, including domain-bound EIP-712 verification, interpolated intents, descriptor maps, literal values, envelope paths, chain IDs, token tickers, durations, enums, interoperable addresses, native sentinels, and richer nested calldata handling.

### Fixed

- Asset-change simulation failures now show an explicit "simulation unavailable" banner instead of silently hiding potential asset movement.
- Bankr API batch and cross-dapp batch receipts now feed the shared receipt-enrichment path, restoring post-confirm asset-change backfills in Activity.
- Chat API errors now extract the useful Bankr error message, wallet-locked chat responses render as error bubbles, and the Midnight chat input no longer gets an extra outer frame.
- The Send screen and token dropdown now stay within the popup viewport, with corrected overflow behavior and theme-aware validation styling.


## [3.13.0] - 2026-05-27

### Fixed

- Bankr API accounts now use Bankr's Wallet API endpoints for direct transaction submission and signature requests (`/wallet/submit` and `/wallet/sign`), restoring dapp transactions and message signing after the legacy `/agent/submit` and `/agent/sign` endpoints were removed.


## [3.12.0] - 2026-05-26

### Added

- **EIP-7702 smart-account support for Private Key and Seed Phrase accounts.** Account Settings now has a Smart Account section where users can review per-chain delegation status, authorize the WalletChan default delegate, set a custom ERC-7821 delegate, or revoke an existing delegation.
- **Atomic local batching for dapp and cross-dapp requests.** Private Key and Seed Phrase accounts can now execute ERC-5792 batches, cross-dapp batches, and multi-transaction swaps as one ERC-7821 transaction via EIP-7702 on supported chains, with a one-time setup banner when a delegation authorization is needed.
- **Batch calldata visibility in confirmations and activity.** Atomic batch and cross-dapp batch confirmations now show the outer calldata digest, and transaction details decode ERC-7821 self-calls back into per-call cards with the original dapp origins where available.
- **Native sends with advanced calldata.** The Send surface can now attach custom hex calldata to native-token transactions and can submit contract deployments by sending bytecode with no recipient.
- **Explorer affordances for resolved Send recipients.** Resolved ENS and address-book recipients now include an explorer shortcut alongside the existing copy affordance.

### Changed

- Swap slippage settings now persist in `chrome.storage.sync`, so the selected tolerance survives popup reloads and browser restarts.
- Custom chains with known MetaMask delegation deployments can use the default 7702 delegate path without manually pasting a delegate address.

### Fixed

- Cross-dapp batch notifications now count each batch as one pending request instead of counting every call inside the batch.
- Cross-dapp batches, swaps, and prepared transaction requests stay pinned to the account that created them, so switching the current account mid-flow no longer rebinds the signer.
- Batch calls can include the zero address when a protocol uses it as a sentinel or no-op call target.
- The account switcher now keeps the active account in view without fighting manual scrolling.
- Chat surfaces and the custom-chain RPC warning banner now follow the active theme's radius and color tokens more consistently.
- Dapp wallet discovery now serves a properly sized embedded PNG icon for EIP-6963 wallet pickers.


## [3.11.0] - 2026-05-22

### Added

- **Cross-chain bridging from the Swap surface** via Bungee — per-side chain + token pickers, source / destination cards in the tx-details modal, formatted route summary with protocol fee, and a destination-chain notification when the bridge fulfills. Same-chain picks still route through the existing 0x swap path; cross-chain picks build a Bungee route, broadcast on the source chain, and poll status in the background.
- **Post-confirm asset changes in activity.** The tx-details modal now decodes ERC-20 `Transfer` events and native value flow from each successful receipt and renders USD-valued deltas with sign-colored amounts. Bridges get a custom source / destination layout; the destination-chain extraction fires automatically when the bridge fulfills. Newly received tokens also show up on the portfolio within 5 minutes via a local cache instead of waiting for the upstream API to reindex.
- **Nested clear-signing for ERC-7730 descriptors with embedded calldata fields.** Safe BatchExecutor, SafeProxyFactory → Safe `setup`, 1inch / Morpho / Aave batch routers, and similar now render each inner call as its own recursively clear-signed card (depth-capped at three). When an inner contract has no registry descriptor, the row stack falls through to a flat To / Value / Calldata layout with the function name decoded inline and a click-to-expand decoded-params view.
- **Proxy resolution for clear-signing.** On a descriptor miss, the wallet reads Safe slot 0 / EIP-1967 logic / EIP-1967 beacon in parallel via RPC and refetches the implementation's descriptor — every user's Safe and any OZ Transparent / UUPS / beacon proxy now inherits its singleton's clear-signing automatically.
- **Safe MultiSend / MultiSendCallOnly built-in clear-signing.** Selector `0x8d80ff0a` unpacks the custom packed `(operation, to, value, data)[]` payload and recursively clear-signs each inner call.
- **Loading spinner on Reject buttons** across single-tx, batch, cross-dapp batch, and signature-request confirmation screens, with a double-click guard and a disabled sibling Confirm while in flight.
- **USD chip on popular-token pills** in the Send and Swap token dropdowns when the user holds the token.

### Changed

- Activity tx-details modal renders the full clear-signing view for ERC-7730 entries (per-field rows like "Amount to supply: 2 USDC", "Collateral recipient: walletchan.eth") instead of the collapsed `intent + contractName + counterparty` snapshot.
- Heavy data fetches (asset-change simulation, gas estimation, clear-signing descriptor) on tx and signature confirmation screens now wait for the slide-in animation to settle before kicking off, eliminating mid-animation jitter.
- Long external-contract labels (eth.sh) inside clear-signed cards stack below the short `0x…` form so names like "Uniswap V3 SwapRouter02" wrap freely without pushing copy and explorer icons off the row.
- Bridge route's "Submitting swap…" CTA flips to "Bridging…", the sWCHAN fee discount label reads "discount applied", and native-token rows in the token dropdowns now show the chain logo instead of an empty initials circle.

### Fixed

- Bankr signing error toasts now show the actual failure reason ("Invalid app ID or app secret.", etc.) instead of a raw JSON blob, and long error text wraps inside the popup instead of pushing the toast off-screen.
- Raw calldata decoder now unpacks Safe `MultiSend(bytes)` payloads at any depth, including the inner packed bytes param of an outer `multiSend` call.
- Decoder no longer pollutes the console with sourcify 500s when it recurses into a `bytes` param with no calldata payload (empty-selector lookups are now skipped).
- Unmatched clear-signing rows in batch confirmations no longer leak roughly 24 px of phantom whitespace per call below the batch header.
- Tier-1 batch gas estimation now falls through to bytecode-injection simulation whenever Alchemy's `eth_simulateV1` reports a call revert, preventing out-of-gas broadcasts on approve + 0x AllowanceHolder swap batches that actually succeed onchain.


## [3.10.0] - 2026-05-21

### Added

- **Multi-address seed picker.** Importing or deriving from a seed phrase now opens a shared chooser that shows ENS, avatars, portfolio USD, and copy / explorer affordances per derived address, with a sticky bottom CTA so 10+ rows stay actionable without scrolling. Account-type glyphs refreshed (BankrAPI / Private Key / Seed Phrase / Impersonator) and the Radio control gets a themed outline + filled dot that's legible on both Bauhaus and Midnight.
- **Per-account transaction history clearing.** Settings → Clear Transaction History lists each account separately so you can wipe one wallet's history without touching the others.
- **Revoke UI for `approve(spender, 0)`.** Single-tx and batch confirmation cards, the Activity row, and the Transaction Details modal now recognize the zero-amount approval pattern and render it as "Revoke USDC approval from …" with a green REVOKE chip instead of "Approve 0 USDC".
- **Native sends render like ERC-20 transfers across every tx surface.** Batch confirmation rows, the Activity tab, and the Transaction Details modal show the native token logo (ETH, BNB, POL, etc.), formatted amount, and recipient avatar / ENS / saved-account label — replacing the previous "Native Transfer" plain text with no logo.

### Fixed

- Gas-fee row hover background now respects the card's rounded corners on both the single-tx and batch confirmation screens (was leaking a sharp rectangle inside the rounded card).
- Seed-phrase account-name inputs no longer lose focus after every keystroke during setup.
- Non-atomic batch revert verdict now trusts the bytecode-injection simulation result, so the confirmation correctly surfaces a "this will revert" warning when one of the constituent calls would fail onchain.
- Non-atomic batch gas buffer widened to 2× per call to survive EIP-150 gas dilution, eliminating spurious out-of-gas reverts on multi-call batches.


## [3.9.0] - 2026-05-19

### Added

- **ENS Browsing.** Type `vitalik.eth` (or any `*.eth` subdomain) in the address bar and WalletChan resolves it through your configured Ethereum mainnet RPC and forwards you to the right gateway — `eth.limo` for IPFS/IPNS content, `w3eth.io` for ERC-4804 onchain HTML dapps. Direct gateway URLs (`*.eth.limo`, `*.eth.link`, and raw `0x<addr>.w3eth.io`) are intercepted too, so shared links land in the same flow. Default ON; toggle in Settings → ENS Browsing.
- **ENS Browsing — local Kubo gateway (opt-in).** Power-user mode: when you have IPFS Desktop (or a local Kubo node) running, IPFS / IPNS sites stream straight from `127.0.0.1:8080` with a themed identity banner — editable address bar that mirrors pathname / search / hash and stays in sync with SPA navigation, plus a 3-dot menu with Copy URL and Open on gateway. Falls back to `eth.limo` silently when Kubo isn't reachable.
- **ENS Browsing — onchain HTML via local Kubo (opt-in).** Pin ERC-4804 dapps (e.g. `zrouter.eth`) to your local Kubo node and serve them from `<cid>.ipfs.localhost` for fully local trust. Requires a one-time Kubo CORS allowlist update; WalletChan opens a guided setup screen on first enable.

### Fixed

- Logo image corners now match rounded surfaces in the Midnight theme.
- Unchecked contract-recipient warning checkbox is now visible in the Bauhaus theme.


## [3.8.0] - 2026-05-17

### Added

- Clear-signed summaries in the Activity tab and Transaction Details modal — approves, transfers, native sends, and ERC-7730 descriptors render with token logos and recipient labels instead of raw `approve` / `exec` text.
- Clear-signed ERC-20 rows on every batch confirmation card (single-tx, dapp-initiated batch, and cross-dapp batch), with the pencil-icon edit affordance on approve amounts now working inside batches.
- Warning banner with acknowledgement checkbox when sending tokens to a recipient address that resolves to a contract (EIP-7702 delegated EOAs are recognized as safe).
- USD value shown alongside token amounts in the clear-signing view for single transactions and EIP-712 signatures.
- Custom / user-added ERC-20 tokens now resolve real USD prices via CoinGecko (with GeckoTerminal fallback) instead of showing $0.

### Changed

- Send screen's balance display is now adaptive — full comma-separated value when the row has room, abbreviated form with a tooltip when it would overflow.
- Holdings "All Networks" filter menu renders in a portal so it floats above the card and no longer pushes layout when only a few tokens are held.

### Fixed

- Permit2 `uint160` max approvals now collapse to "unlimited" with the precise raw amount on hover, matching how `uint256` max was already handled.
- EIP-712 typed-data address labels and explorer links are scoped to the dapp's actual connected chain instead of falling back to mainnet (fixes mislabeled Permit2 sigs on Base and other non-mainnet dapps).
- Standard gas tier icon and label are now visible in the Bauhaus theme.


## [3.7.0] - 2026-05-16

### Added

- **Firefox port** with a parallel AMO build pipeline, manifest variant, and a
  session-storage compatibility layer that uses native `storage.session` on
  supported Firefox and a non-secret local fallback only when unavailable.
- ERC-8213 raw calldata view and EIP-712 digest display on signature requests, so power users can verify exactly what they're signing.
- Calldata digest display also surfaced on the swap confirmation screen.
- Random spot-check highlighting on the emoji digest grid (makes side-by-side verification easier).

### Fixed

- Onboarding no longer loops back to "setup required" after a vault migration.
- EIP-6963 wallet icon now served as a static asset (avoids inline data-URL inflation).
- Digest display adapts to the active theme and defaults to the hex tab.

## [3.6.0] - 2026-05-13

### Added

- ERC-7730 clear-signing for transactions and EIP-712 signatures — descriptors render human-readable summaries of approved dapps' calls.

### Fixed

- Block signing when ERC-20 calldata is malformed (prevents subtly broken approve/transfer payloads from being co-signed).
- Sanitize resolved ENS / domain names to defeat Trojan-Source and homoglyph spoofing in the address bar.

## [3.5.0] - 2026-05-11

### Added

- Flashblocks fast-poll for receipts on Base and Unichain (sub-second pending → confirmed feedback).
- MegaETH sync-send support and handling for chains with non-standard gas models.
- "Split batch" escape hatch on cross-dapp batches for chains that don't accept atomic ERC-7821 execution.

### Changed

- Settings are now grouped into sub-menus with a searchable list.
- Default RPCs switched to drpc.org and hardcoded fallbacks deduped.
- Onboarding flow polished for the Midnight theme, with a built-in theme switcher.
- Dropped the unused `update_url` and `key` fields from the manifest.
- Project-wide spelling unified to "onchain" (no hyphen).

### Fixed

- Dapp tx / signature requests now display correctly when an impersonator account is active.
- ENS refreshes propagate live to the account dropdown.
- Gas overrides: fall back to Standard tier when a dapp suggests `0` fees, floor local gas sim to the dapp-provided `tx.gas`, and show the actually-used gas in tx detail.
- Wallet-initiated transfers are pinned to the active account (enforced via types) to prevent silent account drift.
- Stop flagging RPC issues for unconfigured chains.
- Strip stray `gas` fields from Bankr `/agent/submit` bodies.
- Cross-dapp batch trash icon vertically centered with its row chevron.

## [3.4.0] - 2026-05-05

### Added

- Gas tier picker (Slow / Standard / Fast) with robust EIP-1559 fee estimation across PK and Seed-phrase accounts.
- Unlock state now syncs across all UI surfaces (popup, sidepanel, onboarding tab).
- Rebroadcast button in the tx detail modal for stuck / dropped transactions.
- Ability to remove individual calls from an incoming dapp batch before confirming.
- Token approval confirmation redesigned for readability.
- Chain name shown beside balance for testnet tokens.

### Changed

- Dapp-facing provider errors centralized under a `WalletChan: ` prefix.
- Holdings now zero out native-token USD value on testnets.

### Fixed

- Security hardening pass across auth, signing, view-only mode, and request pinning.
- Swap UX: don't auto-select sell token, flip works for non-held buy tokens, route arrows centered, WCHAN pinned in popular chips, rounded confirm surfaces, symbol-initial token fallback, onchain balance verification, readable highlight rows in dropdowns, correct ETH icon, full token list in You Sell.
- Resilient native-balance fetching and token-price fallback chain in portfolio.
- Add Token modal stabilized and defaults to active chain.
- Calldata view re-renders when the selected tx's data changes in storage.
- Dropped-tx detection in Activity ends the infinite pending spinner.
- Account switcher scrolls the active account into view on open.
- Clicking Swap/Send on a holding now switches the wallet to that token's chain.
- No home-screen flash when rejecting one of several pending requests.
- Multi-request confirmations: pagination centered above the header.
- Show a revert warning when a simulated tx fails.
- Midnight theme: rounded chips, clearer system tiles, refined contrast / radii / chain badges.
- Raised the gas cap used for batch-simulation `eth_call`.

## [3.3.0] - 2026-04-18

### Added

- Vertical-slide screen transition animation across the extension.
- ENS avatar image cache for instant render on reopen.

### Fixed

- Close the popup on cross-dapp batch reject and play the sent animation on batch tx success.
- Polish request screens for sidepanel and the Midnight theme.
- Theme-aware toast styling and RPC alert contrast in Bauhaus.
- Smooth back-transition and holdings cache refresh.

## [3.2.0] - 2026-04-12

### Added

- Theme engine with the new **Midnight** dark theme alongside the default **Bauhaus** light theme. Pick in Settings → Appearance.
- Onboarding detects the system theme for new users.
- "Back to Holdings" affordance on Send and Swap screens; Midnight-styled chain icon chip.

## [3.1.0] - 2026-04-10

### Added

- L2 force-inclusion via L1 deposit for OP Stack chains — escape hatch when an L2 sequencer censors a transaction. Includes batch force-inclusion (sequential L1 broadcast with a tx-history mutex), L1 gas-override plumbing, gating by Bankr L1 reachability, and distinct L1 / L2 failure UI with accurate explorer-link timing.
- Cross-dapp transaction batching: assemble a batch from multiple dapps and confirm them as one ERC-5792 request.
- TxSimulator bytecode-injection tier added to batch gas estimation.
- Asset-change simulation now covers NFTs, with EOA batch fixes.

### Fixed

- Decoded params: unit-conversion controls remain visible for long uint/int values.

## [3.0.2] - 2026-04-09

### Added

- Non-atomic ERC-5792 batching for EOA accounts (Private Key / Seed phrase).
- Network filter dropdown on the Holdings and Activity tabs.

### Fixed

- Activity tab now shows status for plain ETH transfers.

### Security

- Patches addressing issues reported against v3.0.1.

## [3.0.1] - 2026-04-09

### Fixed

- Batch tx simulation was missing incoming tokens.
- Added a copy button on the affected screen.

## [3.0.0] - 2026-04-06

### Added

- **ERC-5792 batch transaction support** with onchain simulation.
- **Decentralized tx asset-change simulation** so users see token flows before signing (with an info tooltip explaining the section).
- **Swap confirmation screen** with gas estimates and batch support.
- **Custom EVM chain support** behind a centralized chain resolver — add any EVM chain via the new Add Chain page (with a Chainlist link).
- **Custom token support** plus `wallet_watchAsset` (EIP-747).
- **ERC-20 approve detection** with a human-readable display on tx confirmation.
- **Sponsored USDC transfer** flow (ERC-3009) in the extension UI, with graceful fallback to a normal send on failure and an env-var kill switch.
- **QR code modal** and Send button on the homepage; custom token-address input across Swap and Send pages.
- **My Wallets recipient picker** on the Send page.
- **Stake button** with live APY badge plus a WalletChan OS banner.
- **Portfolio sparkline chart** on the homepage with hover tooltips and hide-balance support.
- **$WCHAN button** that opens the swap view, with Permit2 approval support for custom WCHAN routes.
- **Copy token address** action on hover in the Holdings list.
- **Swap action on hover** in the Holdings list.
- Responsive middle-truncated address display with a gradient fade.
- Adaptive header layout (account name truncation + chain selector wrapping).
- Send page testnet-chain indicator fix.

### Changed

- Direct-broadcast path for swaps with a single button, polished Activity tab, more compact homepage layout.
- Swap fees reduced to **0.8%** with a **0.3% premium tier for sWCHAN stakers**; coverage expanded to all 22 0x-supported chains. Premium tier surfaced as a "sWCHAN Staker" label in swap quotes. Fee collection prefers stablecoins and blue-chip tokens.
- Holdings tab: heavy black borders removed from tab icons for a cleaner look.
- Address truncation on the homepage now uses `pretext` for better legibility.

### Fixed

- Popup-mode polish: signature request layout, tx animation, sidepanel persistence.
- Asset-change simulation for Permit2 swaps; native-token layout corrected.
- Failed sponsored USDC transfers no longer recorded to activity history.
- Tx confirmation polish: banner, favicon, gas fee, asset changes.
- Swap page polish: native token display, quote details UI, sticky button.

## [2.1.0] - 2026-03-28

### Added

- Separate **DeFi positions** view from wallet holdings; surfaces WCHAN RPC balance.
- **Pending tx polling** with receipt polling and a redesigned Activity list.
- **Nonce manager** for PK / Seed accounts plus broader tx robustness improvements.
- **Arbitrum and BNB Chain** support.
- Token-transfer UX: USD toggle, percentage slider, max-precision fix.
- Show token name and logo in Activity for wallet-initiated transfers.
- Copy address from the account dropdown.

### Fixed

- Compact tx confirmation layout with sticky bottom buttons.
- Copy-feedback uses a checkmark icon instead of a toast (toasts blocked nearby buttons); explorer link added on the tx "To" address.
- Popup window detection, cross-context tx sync, and message listener reliability.
- Surface ENS resolution RPC errors to the user instead of showing "Invalid address or name".
- Reliable sidepanel detection with instant popup-to-sidepanel transition.
- Restore non-Chrome browser detection so Arc falls back to the popup correctly.
- Chevron placement in the account dropdown.
- Strip query params from the Sourcify function-name lookup.

## [2.0.1] - 2026-03-27

### Added

- Copy buttons on the transaction confirmation popup.

### Fixed

- Storage-based results for tx and signature requests (survives popup close), extended to the RPC proxy path, keyed by content-script UUID for reliability.
- Polish pass on tx confirmation UI — copy button placement, redesigned Tenderly link, more concise revert errors.

## [2.0.0] - 2026-02-26

### Changed

- **Renamed BankrWallet → WalletChan** across the extension, manifest, and assets. Replaced `bnkrw` references with `wchan` (contract address, GeckoTerminal chart embed, BuyModal → in-app swap).
- Injected wallet icon is now an animated GIF.

### Added

- `.mega` domain name resolution via the MegaNames contract.

## [1.3.1] - 2026-02-15

### Added

- EIP-712 schema validation to reject malicious signature requests.
- Fullscreen button on the unlock screen.

### Fixed

- Agent password now works for signing transactions with Private Key accounts (not just Bankr API).

## [1.3.0] - 2026-02-10

### Fixed

- Strip the `gas` field from Bankr API transaction submissions to match server expectations.

## [1.2.0] - 2026-02-09

### Changed

- Chain config consolidated into a single registry.
- Release script rewritten to be monorepo-aware (replaces `npm version`).

## [1.1.0] - 2026-02-09

### Added

- **MegaETH chain support.**
- ENS / Basename / `.wei` name resolution when adding an Impersonator account.
- Chain availability now restricted by account type, with chain constants consolidated.

### Fixed

- Prevent removing the last account.
- Arc browser popup not opening (sidepanel regression).
- GitHub Release zip / CRX missing `key` and `update_url` fields for self-hosted auto-update.
- Use the official MegaETH icon and brand colors.

## [1.0.0] - 2026-02-08

This release is a full rebuild of the wallet — multiple account types, a real portfolio view, calldata decoding, signature inspection, and an optional agent password.

### Added

- **Private Key accounts** — local signing with contract-deployment support.
- **Seed Phrase accounts** (BIP39 12-word mnemonics) with derivation-index display, labels and renaming, auto-switch on add, native `bytesToHex` (no Node.js `Buffer`), and a reveal-seed-phrase option in account settings.
- **Impersonator accounts** (view-only) plus a PK generator in onboarding.
- **Vault key system** with an **optional agent password** for unattended signing, including backend guards.
- **Token holdings portfolio** powered by Octav, with tabbed view, onchain balance verification, multicall-batched balance calls with API fallback, refresh on account switch, circular token logos, uppercase symbol display, and responsive layout.
- **Token transfer** flow from the portfolio with ENS / Basename recipient resolution and chain name displayed next to the icon.
- **Calldata decoder** with instant local decoding, background Sourcify ABI fetch, rich per-type param components (uint / int conversion dropdowns rendered via Portal to avoid modal clipping), Tenderly external-link icon, and state persisted across tab switches.
- **Tenderly simulation button** on tx confirmation (including contract deployments).
- **Structured typed-data display** for signature requests with tabbed Message / Raw view and collapsible Types section, plus address actions in the typed-data display.
- **Tx detail modal** with function names and a gas-fee breakdown.
- **Pre-confirmation gas estimation** with editable params and warnings.
- **Account settings modal** with a reveal-private-key option, settings gear icon alignment in the dropdown.
- **Fullscreen tab mode**; sidepanel toggle moved into settings.
- **WNS (`.wei`) name resolution** across the wallet.
- **`/agent/submit` and `/agent/sign`** for Bankr accounts; **cancel button** for processing Bankr API transactions (hidden on Bankr accounts where not applicable).
- **Live status updates** from the Bankr API in the chat loading state.
- **ENS / Basename auto-resolution** for accounts (names + avatars), avatars now using `blo`.
- **EIP-1193 connect event** emitted on `eth_requestAccounts`.
- **From-account display** with avatar and type badge in tx / sig views.
- **Portfolio snapshot storage** as the foundation for the homepage holdings chart.
- New-install default auto-lock changed to **Never**.
- Chain selector moved inline next to the account switcher.

### Changed

- Onboarding simplified to a single account type with a 2-column layout; seed-phrase onboarding collects mnemonic before password.
- `background.ts` modularized into focused handler modules.

### Fixed

- Session restoration when auto-lock is set to "Never" (covers all handlers that need credentials).
- Auto-lock timer only counts down when the UI is closed.
- Storage migration from v0.1.1 / v0.2.0 → v1.0.0 (prevents existing users from getting stuck after upgrade).
- Send button no longer blocks on secondary address resolution.
- Address display and holdings sync when an account is added or changed.
- PK-to-seed-phrase account conversion on address collision.
- Holdings: removed max-height constraints on Holdings and Activity tabs.
- `BankrWallet` icon shown for internal-transfer origin.
- Various polish: ShapesLoader spacing scales with size, decoded-calldata UI persistence, non-URL origins handled in `TransactionConfirmation`.

### Security

- Atomic password change, RPC validation, transaction expiry, and double-execution prevention.
- Message-leak hardening, vault re-encryption on password change, reset cleanup, sender verification.
- Agent password backend guards and a security audit pass.

## [0.2.0] - 2026-02-03

### Added

- **Chat to wallet** — natural-language prompt surface for the Bankr agent.
- **Self-hosted auto-update** for Chrome with a dedicated update-manifest endpoint.

## [0.1.1] - 2026-01-31

### Added

- "Powered by" attribution banner in the header.

## [0.1.0] - 2026-01-30

### Added

- Initial public release of the Bankr Wallet browser extension.
- Bankr API account support with AES-256-GCM-encrypted API keys (PBKDF2, 600k iterations) and configurable auto-lock timeout.
- Transaction confirmation popup with notifications, multi-request handling, signature requests, and combined tx/sig navigation.
- EIP-6963 wallet discovery alongside `window.ethereum`.
- Sidepanel support (Chrome/Brave) with popup fallback for Arc.
- Dapp-initiated chain switching with per-tab chain state and unsupported-chain error handling.
- Onboarding flow with default Base network and ordered chain list.
- View address on Debank from the homepage.
- Lock-wallet button and footer attribution.

[Unreleased]: https://github.com/apoorvlathey/walletchan/compare/v4.0.0...HEAD
[4.0.0]: https://github.com/apoorvlathey/walletchan/compare/v3.19.0...v4.0.0
[3.19.0]: https://github.com/apoorvlathey/walletchan/compare/v3.18.0...v3.19.0
[3.18.0]: https://github.com/apoorvlathey/walletchan/compare/v3.17.0...v3.18.0
[3.17.0]: https://github.com/apoorvlathey/walletchan/compare/v3.16.0...v3.17.0
[3.16.0]: https://github.com/apoorvlathey/walletchan/compare/v3.15.0...v3.16.0
[3.15.0]: https://github.com/apoorvlathey/walletchan/compare/v3.14.0...v3.15.0
[3.14.0]: https://github.com/apoorvlathey/walletchan/compare/v3.13.0...v3.14.0
[3.13.0]: https://github.com/apoorvlathey/walletchan/compare/v3.12.0...v3.13.0
[3.12.0]: https://github.com/apoorvlathey/walletchan/compare/v3.11.0...v3.12.0
[3.11.0]: https://github.com/apoorvlathey/walletchan/compare/v3.10.0...v3.11.0
[3.10.0]: https://github.com/apoorvlathey/walletchan/compare/v3.9.0...v3.10.0
[3.9.0]: https://github.com/apoorvlathey/walletchan/compare/v3.8.0...v3.9.0
[3.8.0]: https://github.com/apoorvlathey/walletchan/compare/v3.7.0...v3.8.0
[3.7.0]: https://github.com/apoorvlathey/walletchan/compare/v3.6.0...v3.7.0
[3.6.0]: https://github.com/apoorvlathey/walletchan/compare/v3.5.0...v3.6.0
[3.5.0]: https://github.com/apoorvlathey/walletchan/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/apoorvlathey/walletchan/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/apoorvlathey/walletchan/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/apoorvlathey/walletchan/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/apoorvlathey/walletchan/compare/v3.0.2...v3.1.0
[3.0.2]: https://github.com/apoorvlathey/walletchan/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/apoorvlathey/walletchan/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/apoorvlathey/walletchan/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/apoorvlathey/walletchan/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/apoorvlathey/walletchan/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/apoorvlathey/walletchan/compare/v1.3.1...v2.0.0
[1.3.1]: https://github.com/apoorvlathey/walletchan/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/apoorvlathey/walletchan/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/apoorvlathey/walletchan/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/apoorvlathey/walletchan/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/apoorvlathey/walletchan/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/apoorvlathey/walletchan/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/apoorvlathey/walletchan/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/apoorvlathey/walletchan/releases/tag/v0.1.0
