# Privacy Policy

**Last Updated:** July 27, 2026

WalletChan ("the Extension") is an Ethereum and EVM browser wallet for
managing accounts, connecting to decentralized applications (dapps), and
reviewing wallet actions. It supports local private-key and seed-phrase
accounts, Ledger hardware accounts, existing Safe multisigs, view-only
accounts, and an optional Bankr API account. This Privacy Policy explains how
we handle your information.

---

## Data Collection

### Data Stored Locally on Your Device

The Extension stores the following data locally in your browser using Chrome's storage APIs:

- **Encrypted Local Wallet Data**: Private keys and seed phrases that you add
  to WalletChan are encrypted on your device. Ledger private keys remain on the
  hardware device.
- **Account Metadata**: Public wallet addresses, labels, selected accounts,
  Ledger derivation metadata, view-only accounts, and Safe account metadata.
- **Network Configuration**: Your custom RPC endpoints and network settings.
- **Transaction History**: A record of your last 50 transactions (stored locally for your reference).
- **User Preferences**: Settings such as auto-lock timeout and display preferences.
- **Encrypted Bankr Credential**: If you add a Bankr account, its API key is
  encrypted locally using the wallet's protected vault.

**Important**: All of this data remains on your device. We do not have access to it and cannot retrieve it.

---

## Data Transmission

The Extension transmits data to the following external services:

| Service                         | Data Sent                    | Purpose                                            |
| ------------------------------- | ---------------------------- | -------------------------------------------------- |
| **Blockchain RPC Endpoints**    | Standard Web3 RPC calls      | Read blockchain state (balances, contract data)    |
| **eth.sh API**                  | Blockchain addresses         | Fetch human-readable labels for contract addresses |
| **Google Favicons**             | Website domains              | Display website icons in the UI                    |
| **Bankr API** (`api.bankr.bot`) | Transaction details, API key | Execute or sign actions for an added Bankr account |

---

## Data We Do NOT Collect

- Browsing history or website visits
- Personal information (name, email, etc.)
- Analytics or usage tracking data
- Keystrokes or form inputs outside the Extension
- Your password (only used to derive encryption keys, never stored or transmitted)

---

## Data Retention

- **Local Data**: Stored until you clear it via the Extension settings or uninstall the Extension.
- **Transaction History**: Limited to the 50 most recent transactions; older entries are automatically removed.
- **No Server Storage**: We do not operate servers that store your data. All persistent data is stored locally on your device.

---

## Data Deletion

You can delete your data at any time:

1. **Clear Transaction History**: Go to Settings → Clear Transaction History
2. **Reset Extension**: Uninstall and reinstall the Extension to remove all stored data
3. **Browser Data**: Clear your browser's extension storage via browser settings

---

## Third-Party Services

The Extension relies on the following third-party services:

- **Blockchain Networks**: Transactions are submitted to the Ethereum or EVM
  network selected for the action.
- **Bankr API**: Used only for Bankr-account actions. Subject to Bankr's terms
  of service.

---

## Security

- API keys are encrypted using AES-256-GCM with PBKDF2 key derivation (600,000 iterations)
- Your password never leaves your device and is never stored
- The Extension auto-locks after a configurable timeout period
- All code is bundled at build time; no remote code is executed

---

## Children's Privacy

The Extension is not intended for use by children under 13 years of age. We do not knowingly collect information from children.

---

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected in the "Last Updated" date at the top of this document.

---

## Contact

If you have questions about this Privacy Policy, you can reach out via:

- Twitter/X: [@apoorveth](https://x.com/apoorveth)
- GitHub: Open an issue in the repository

---

## Open Source

WalletChan is open source. You can review the code to verify our privacy practices.
