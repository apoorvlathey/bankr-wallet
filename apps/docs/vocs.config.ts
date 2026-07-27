import { defineConfig } from "vocs/config";

const chromeStoreUrl =
  "https://chromewebstore.google.com/detail/walletchan/kofbkhbkfhiollbhjkbebajngppmpbgc";

export default defineConfig({
  accentColor: "#2563EB",
  baseUrl:
    process.env.VERCEL_ENV === "production"
      ? "https://docs.walletchan.com"
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NODE_ENV === "development"
          ? "http://localhost:5173"
          : "https://docs.walletchan.com",
  checkDeadlinks: true,
  colorScheme: "dark",
  description:
    "Guides and answers for every WalletChan feature: accounts, dapps, transactions, swaps, privacy, security, networks, and settings.",
  editLink: {
    link: "https://github.com/apoorvlathey/walletchan/edit/main/apps/docs/src/pages/:path",
  },
  iconUrl: "/favicon.ico",
  jsonLd: true,
  logoUrl: "/walletchan-icon.png",
  mcp: {
    enabled: true,
  },
  ogImageUrl: (_path, { baseUrl }) =>
    `${baseUrl ?? ""}/api/og?logo=%logo&title=%title&description=%description`,
  search: {
    boost: { title: 5, subtitle: 4, text: 2, category: 1, titles: 2 },
    combineWith: "AND",
    fuzzy: 0.2,
    prefix: true,
  },
  sidebar: [
    {
      text: "Start here",
      collapsed: false,
      items: [
        { text: "Welcome", link: "/" },
        { text: "Install WalletChan", link: "/getting-started/install" },
        { text: "Create or import a wallet", link: "/getting-started/create-or-import" },
        { text: "Feature atlas", link: "/overview/feature-atlas" },
        { text: "Supported networks", link: "/overview/networks" },
      ],
    },
    {
      text: "Use your wallet",
      collapsed: true,
      items: [
        { text: "Home & portfolio", link: "/wallet/home-and-portfolio" },
        { text: "Send tokens", link: "/wallet/send" },
        { text: "Swap or bridge", link: "/wallet/swap-and-bridge" },
        { text: "Activity & receipts", link: "/wallet/activity" },
        { text: "Address book", link: "/wallet/address-book" },
        { text: "Tokens & balances", link: "/wallet/tokens" },
        { text: "Bankr chat", link: "/wallet/bankr-chat" },
        { text: "Stake WCHAN", link: "/wallet/staking" },
      ],
    },
    {
      text: "Accounts",
      collapsed: true,
      items: [
        { text: "Account types", link: "/accounts/account-types" },
        { text: "Private-key accounts", link: "/accounts/private-key" },
        { text: "Seed-phrase accounts", link: "/accounts/seed-phrase" },
        { text: "Ledger accounts", link: "/accounts/ledger" },
        { text: "View-only accounts", link: "/accounts/view-only" },
        { text: "Safe multisig accounts", link: "/accounts/safe" },
        { text: "Manage accounts", link: "/accounts/manage" },
        { text: "Bankr accounts", link: "/accounts/bankr" },
      ],
    },
    {
      text: "Dapps & web3",
      collapsed: true,
      items: [
        { text: "Connect to dapps", link: "/dapps/connect" },
        { text: "WalletConnect", link: "/dapps/walletconnect" },
        { text: "Web3 browser", link: "/dapps/web3-browser" },
        { text: "Networks & token requests", link: "/dapps/network-and-token-requests" },
        { text: "Permissions & sessions", link: "/dapps/permissions" },
      ],
    },
    {
      text: "Transactions & signing",
      collapsed: true,
      items: [
        { text: "Review a transaction", link: "/transactions/review" },
        { text: "Simulation & clear signing", link: "/transactions/simulation" },
        { text: "Messages, typed data & SIWE", link: "/transactions/signatures" },
        { text: "Batch transactions", link: "/transactions/batches" },
        { text: "Gas, speed & fee tokens", link: "/transactions/gas-and-fees" },
        { text: "Cancel or speed up", link: "/transactions/replacements" },
        { text: "Approval cleanup", link: "/transactions/approval-cleanup" },
        { text: "Force inclusion", link: "/transactions/force-inclusion" },
      ],
    },
    {
      text: "Smart accounts",
      collapsed: true,
      items: [
        { text: "Smart account delegation", link: "/smart-accounts/delegation" },
        { text: "Advanced dapp permissions", link: "/smart-accounts/erc-7715" },
      ],
    },
    {
      text: "Privacy",
      collapsed: true,
      items: [
        { text: "Privacy Shield", link: "/privacy/shield" },
        { text: "Unshield & recover", link: "/privacy/unshield-and-recovery" },
      ],
    },
    {
      text: "Security & access",
      collapsed: true,
      items: [
        { text: "How WalletChan protects you", link: "/security/overview" },
        { text: "Passwords & unlock", link: "/security/passwords" },
        { text: "Biometric unlock", link: "/security/biometric-unlock" },
        { text: "Agent password", link: "/security/agent-password" },
        { text: "Backups & secret recovery", link: "/security/backups" },
      ],
    },
    {
      text: "Settings",
      collapsed: true,
      items: [
        { text: "All settings", link: "/settings/all-settings" },
        { text: "Networks & RPCs", link: "/settings/networks-and-rpcs" },
        { text: "Appearance & sounds", link: "/settings/appearance-and-sounds" },
        { text: "Data & history", link: "/settings/data-and-history" },
      ],
    },
    {
      text: "Developers & AI",
      collapsed: true,
      items: [
        { text: "WalletChan RPC", link: "/developers/walletchan-rpc" },
        { text: "WalletChan MCP", link: "/developers/walletchan-mcp" },
      ],
    },
    {
      text: "Help & reference",
      collapsed: false,
      items: [
        { text: "Frequently asked questions", link: "/help/faq" },
        { text: "Troubleshooting", link: "/help/troubleshooting" },
        { text: "Wallet behavior by account", link: "/reference/account-behavior" },
        { text: "Ethereum standards", link: "/reference/standards" },
        { text: "Glossary", link: "/reference/glossary" },
      ],
    },
  ],
  socials: [
    { icon: "github", link: "https://github.com/apoorvlathey/walletchan" },
    { icon: "x", link: "https://x.com/walletchan_" },
  ],
  title: "WalletChan Docs - Web3 Wallet",
  titleTemplate: "%s · WalletChan",
  topNav: [
    { text: "Docs", link: "/overview/feature-atlas" },
    { text: "FAQ", link: "/help/faq" },
    { text: "walletchan.com", link: "https://walletchan.com" },
    { text: "Install", link: chromeStoreUrl },
  ],
});
