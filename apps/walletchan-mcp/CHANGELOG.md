# Changelog

All notable changes to `@walletchan/mcp` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.4.0] - 2026-07-09

### Added

- Added MetaMask Connect support for the managed WalletChan RPC bridge with `--wallet-transport metamask-connect` and `WALLETCHAN_MCP_WALLET_TRANSPORT`.
- Added live managed-RPC wallet transport switching through `get_pairing_uri({ walletTransport, forceNewSession })`.
- Added MetaMask Connect account request support through `get_pairing_uri({ account, forceRequest })`.
- Added MCP QR image support for MetaMask Connect pairing URIs.
- Added forward name-resolution tools: `resolve_name` and `resolve_names`.
- Added WalletChan extension parity for name-to-address resolution: ENS/subdomains, Basenames under `.base.eth`, WNS `.wei`, GNS `.gwei`, and MegaNames `.mega`.

### Changed

- Updated the managed RPC dependency range to `@walletchan/rpc@^0.3.0`.
- Updated package docs, MCP skill docs, and runtime instructions for wallet-transport selection and name-resolution usage.
- Raised the package engine to Node.js `>=20.19.0` to match the managed RPC and MetaMask Connect runtime requirements.

## [0.3.0] - 2026-06-16

### Added

- Added local encrypted agent wallets.
- Added delegated `agent:<walletId>` execution profiles backed by ERC-7710 delegations and the 1Shot relayer.
- Added raw `agent-eoa:<walletId>` execution profiles for explicit local agent-wallet signing.
- Added agent delegation preparation, WalletChan signature requests, delegation completion, and reusable function-call delegation handling.
- Added delegated x402 quote/payment helpers for endpoints that advertise ERC-7710 payment support.

### Changed

- Expanded tool routing so swaps, bridges, prepared calls, and protocol helpers can choose between WalletChan approval and agent execution profiles.

## [0.2.0] - 2026-06-10

### Added

- Added managed Veil MCP integration with controlled working directories and first-class Veil tools.
- Added protocol registry and stdio MCP child-process support.
- Added Veil public register/deposit preparation routed through WalletChan approval.
- Added Veil x402 payment helpers with explicit quote, cap, and confirmation flow.

### Changed

- Updated managed RPC and QR pairing behavior for the combined RPC + MCP release.
- Expanded MCP package docs, skill docs, and environment examples.

## [0.1.2] - 2026-06-01

### Added

- Added release-prep updates for ERC-5792-aware WalletChan RPC behavior.
- Added MCP tool/documentation updates for batching, request status, and sequential fallback behavior.

### Changed

- Updated MCP package metadata and server info for the 0.1.2 release.

## [0.1.1] - 2026-06-01

### Added

- Added browser QR image content support for pairing flows.
- Added QR-aware `get_pairing_uri` output for MCP clients that render image content.

### Changed

- Improved managed RPC pairing guidance and raw URI fallbacks.

## [0.1.0] - 2026-05-31

### Added

- Initial `@walletchan/mcp` package.
- Added local stdio MCP server backed by managed `walletchan-rpc`.
- Added WalletChan wallet tools for pairing, wallets, sends, calls, signatures, request status, portfolio, swaps, bridges, and bridge status.
- Added adapted Base MCP-style skill resources and allowlisted helpers for protocol HTTP requests, protocol CLIs, and remote MCP profiles.
- Added SIWE validation/signing helpers for protocol authentication flows.
