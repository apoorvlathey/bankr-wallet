// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages } from 'waku/router'

// prettier-ignore
type Page =
  | { path: '/accounts/account-types'; render: 'static' }
  | { path: '/accounts/bankr'; render: 'static' }
  | { path: '/accounts/ledger'; render: 'static' }
  | { path: '/accounts/manage'; render: 'static' }
  | { path: '/accounts/private-key'; render: 'static' }
  | { path: '/accounts/safe'; render: 'static' }
  | { path: '/accounts/seed-phrase'; render: 'static' }
  | { path: '/accounts/view-only'; render: 'static' }
  | { path: '/dapps/connect'; render: 'static' }
  | { path: '/dapps/network-and-token-requests'; render: 'static' }
  | { path: '/dapps/permissions'; render: 'static' }
  | { path: '/dapps/walletconnect'; render: 'static' }
  | { path: '/dapps/web3-browser'; render: 'static' }
  | { path: '/developers/walletchan-mcp'; render: 'static' }
  | { path: '/developers/walletchan-rpc'; render: 'static' }
  | { path: '/getting-started/create-or-import'; render: 'static' }
  | { path: '/getting-started/install'; render: 'static' }
  | { path: '/help/faq'; render: 'static' }
  | { path: '/help/troubleshooting'; render: 'static' }
  | { path: '/'; render: 'static' }
  | { path: '/overview/feature-atlas'; render: 'static' }
  | { path: '/overview/networks'; render: 'static' }
  | { path: '/privacy/shield'; render: 'static' }
  | { path: '/privacy/unshield-and-recovery'; render: 'static' }
  | { path: '/reference/account-behavior'; render: 'static' }
  | { path: '/reference/glossary'; render: 'static' }
  | { path: '/reference/standards'; render: 'static' }
  | { path: '/security/agent-password'; render: 'static' }
  | { path: '/security/backups'; render: 'static' }
  | { path: '/security/biometric-unlock'; render: 'static' }
  | { path: '/security/overview'; render: 'static' }
  | { path: '/security/passwords'; render: 'static' }
  | { path: '/settings/all-settings'; render: 'static' }
  | { path: '/settings/appearance-and-sounds'; render: 'static' }
  | { path: '/settings/data-and-history'; render: 'static' }
  | { path: '/settings/networks-and-rpcs'; render: 'static' }
  | { path: '/smart-accounts/delegation'; render: 'static' }
  | { path: '/smart-accounts/erc-7715'; render: 'static' }
  | { path: '/transactions/approval-cleanup'; render: 'static' }
  | { path: '/transactions/batches'; render: 'static' }
  | { path: '/transactions/force-inclusion'; render: 'static' }
  | { path: '/transactions/gas-and-fees'; render: 'static' }
  | { path: '/transactions/replacements'; render: 'static' }
  | { path: '/transactions/review'; render: 'static' }
  | { path: '/transactions/signatures'; render: 'static' }
  | { path: '/transactions/simulation'; render: 'static' }
  | { path: '/wallet/activity'; render: 'static' }
  | { path: '/wallet/address-book'; render: 'static' }
  | { path: '/wallet/bankr-chat'; render: 'static' }
  | { path: '/wallet/home-and-portfolio'; render: 'static' }
  | { path: '/wallet/send'; render: 'static' }
  | { path: '/wallet/staking'; render: 'static' }
  | { path: '/wallet/swap-and-bridge'; render: 'static' }
  | { path: '/wallet/tokens'; render: 'static' }

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>
  }
  interface CreatePagesConfig {
    pages: Page
  }
}
