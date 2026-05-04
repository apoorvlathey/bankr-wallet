# WalletChan

<p align="center">
  <img src="./.github/walletchan-header.png" alt="WalletChan" />
</p>

<p align="center">
  <b>The Wallet for AI Era. Use your Bankr Address across all the dapps, just like Metamask!</b>
</p>

<p align="center">
  <a href="https://walletchan.com/">https://walletchan.com/</a>
</p>

<p align="center">
  Agent Skills for WalletChan: <a href="https://github.com/apoorvlathey/walletchan-skill">apoorvlathey/walletchan-skill</a>
</p>

<table>
  <tr>
    <td><img src="./apps/website/public/screenshots/password-page.png" alt="Password Page" /></td>
    <td><img src="./apps/website/public/screenshots/homepage-new.png" alt="Homepage" /></td>
    <td><img src="./apps/website/public/screenshots/settings.png" alt="Settings Page" /></td>
  </tr>
</table>

<img src="./apps/website/public/screenshots/tx-request.png" alt="Transaction Request" />

## Features

- **Transaction Execution** - Submits transactions through the Bankr API
- **Works in Browser Side Panel** - Keep the wallet in sight for quick access, and no popups!
- **Multi-Chain Support** - Base, Ethereum, Polygon, and Unichain
- **Per-Tab Chain State** - Different chains in different browser tabs
- **Transaction History** - Track your recent transactions with status updates
- **Browser Notifications** - Get notified when transactions complete
- **EIP-6963 Compatible** - Works alongside other wallets with modern dapp discovery
- **Secure Storage** - API key encrypted with AES-256-GCM

## Installation

### Download

1. Go to the [latest release](https://github.com/apoorvlathey/walletchan/releases/latest) on GitHub
2. Download the `walletchan-vX.Y.Z.zip` file from the release assets (e.g., `walletchan-v2.0.0.zip`)
3. Extract the zip file to a folder on your computer

### Chrome / Brave / Arc

<img src="./.github/installation/developer-mode.png" width="600px" alt="Chrome Developer Mode toggle" />

1. Open your browser and navigate to the extensions page: `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the extracted folder containing the extension files

## Getting Started

1. Install the extension
2. Click the WalletChan icon to open the onboarding wizard
3. Enter your Bankr API key (get one from [bankr.bot](https://bankr.bot/api))
4. Enter your wallet address corresponding to the API key (supports ENS)
5. Create a password to secure your API key
6. Connect to any dapp and start transacting!

## Development

This repository is a monorepo containing the browser extension and [website](apps/website/). See [DEVELOPMENT.md](_docs/DEVELOPMENT.md) for detailed development instructions.

### Prerequisites

- Node.js (see `.nvmrc` for version)
- pnpm

### Building from Source

```bash
# Install dependencies
pnpm install

# Build the extension
pnpm build:extension

# The built extension will be in `apps/extension/build/`
```

## Architecture

For detailed implementation documentation, see [IMPLEMENTATION.md](_docs/IMPLEMENTATION.md).

## Security

- API key is encrypted using AES-256-GCM with PBKDF2 key derivation (600,000 iterations)
- Password is never stored, only used to derive encryption key
- Decrypted API key is cached in memory with configurable auto-lock timeout
- Every transaction requires explicit user confirmation

## License

MIT

## Author

Built by [@apoorveth](https://x.com/apoorveth)
