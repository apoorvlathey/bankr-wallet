# Changelog

All notable changes to `@walletchan/rpc` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.3.0] - 2026-07-09

### Added

- Added MetaMask Connect as an optional wallet transport with `--wallet-transport metamask-connect`.
- Added live wallet-transport switching through `/pairing?transport=metamask-connect|walletconnect`.
- Added MetaMask Connect account request support with `/pairing?account=...&forceRequest=true`.
- Added a packaged WalletChan logo asset for the browser QR page.
- Added connected-state QR page UI showing the connected address.

### Changed

- Generalized the WalletConnect bridge into a wallet transport interface used by both WalletConnect and MetaMask Connect.
- Updated `/health`, `/session`, `/pairing`, `/qr?format=json`, and runtime `SKILL.md` output to report the active wallet transport.
- Improved the browser QR page with WalletChan branding, QR refresh animation, and transport-aware copy/pairing text.
- Raised the package engine to Node.js `>=20.19.0` to match MetaMask Connect's runtime requirements.

### Fixed

- Kept the RPC server running when initial MetaMask Connect pairing fails or times out.

## [0.2.0] - 2026-06-10

### Added

- Added npm release metadata updates for the first combined RPC + MCP release.
- Added compatibility updates needed by the MCP managed-RPC flow.

### Changed

- Refined session and pairing docs for npm consumers and MCP clients.

## [0.1.4] - 2026-06-01

### Added

- Added ERC-5792 `wallet_sendCalls` support with native WalletConnect forwarding when approved by the wallet.
- Added sequential fallback for `wallet_sendCalls` when the paired wallet does not support ERC-5792 batching.
- Added local bundle status tracking for sequential fallback calls.
- Added `wallet_getCapabilities`, `wallet_getCallsStatus`, and `wallet_showCallsStatus` handling.

### Changed

- Expanded WalletConnect proposal/session validation around requested methods and chains.
- Improved CLI and runtime skill guidance for batching and Foundry-style unlocked account usage.

## [0.1.3] - 2026-06-01

### Added

- Added browser QR pairing page at `/qr`.
- Added pairing URI JSON/compatibility surfaces for agents and MCP clients.
- Added QR code package assets to npm packaging.

### Changed

- Improved pairing UX for terminal and browser-based clients.

## [0.1.2] - 2026-05-31

### Added

- Added session lifecycle improvements for stale or disconnected WalletConnect sessions.
- Added expanded health/session behavior for MCP-managed consumers.

### Changed

- Improved WalletConnect session restore and validation.
- Improved local JSON-RPC handling for account, chain, and wallet request routing.

## [0.1.1] - 2026-05-30

### Changed

- Expanded built-in chain aliases and default RPC metadata.
- Clarified README and agent skill guidance for custom chain support.

## [0.1.0] - 2026-05-30

### Added

- Initial `@walletchan/rpc` package.
- Added local JSON-RPC server backed by WalletConnect wallet approval.
- Added CLI chain/RPC configuration, WalletConnect pairing, terminal QR output, clipboard copy, health/session endpoints, and runtime `SKILL.md`.
- Added JSON-RPC routing for accounts, chain switching, sends, signatures, and upstream read forwarding.
