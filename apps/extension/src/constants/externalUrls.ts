/**
 * Centralized external URL constants for the extension.
 * Keep all API endpoints, service URLs, and external links here
 * so they're easy to find, audit, and update.
 */

// ---------------------------------------------------------------------------
// WalletChan APIs
//
// Single switch for the API base. Under `pnpm dev:extension` (Vite mode ===
// "development") we point at the local Next.js dev server so any proxy route
// you're working on round-trips against `pnpm dev:website` without a deploy.
// Production builds hit walletchan.eth.sh so users on ISPs that block
// walletchan.com DNS can still use extension-backed website APIs.
//
// Port is centralised in `WALLETCHAN_DEV_PORT` — match it with the website's
// dev script (`apps/website/package.json` runs `next dev -p 3030`). When you
// need to change the port, change it here AND in that one script.
//
// Note: `import.meta.env.DEV` is NOT the right toggle — it's only true under
// the `vite` dev-server, not `vite build`. Always gate on `MODE`.
// ---------------------------------------------------------------------------
export const WALLETCHAN_DEV_PORT = 3030;
export const WALLETCHAN_SITE_HOST = "walletchan.eth.sh";
export const WALLETCHAN_SITE_URL = `https://${WALLETCHAN_SITE_HOST}`;
const WALLETCHAN_API_BASE_PROD = `${WALLETCHAN_SITE_URL}/api`;
const WALLETCHAN_API_BASE_DEV = `http://localhost:${WALLETCHAN_DEV_PORT}/api`;
export const WALLETCHAN_API_BASE =
  import.meta.env?.MODE === "development"
    ? WALLETCHAN_API_BASE_DEV
    : WALLETCHAN_API_BASE_PROD;

export const WALLETCHAN_PORTFOLIO_API = `${WALLETCHAN_API_BASE}/portfolio`;
export const WALLETCHAN_SWAP_API_BASE = `${WALLETCHAN_API_BASE}/swap`;
export const WALLETCHAN_BRIDGE_API_BASE = `${WALLETCHAN_API_BASE}/bridge`;
export const WALLETCHAN_SPONSORED_TRANSFER_API = `${WALLETCHAN_API_BASE}/sponsored-transfer`;
export const WALLETCHAN_PREMIUM_STATUS_API = `${WALLETCHAN_API_BASE}/premium-status`;
export const WALLETCHAN_VAULT_DATA_API = `${WALLETCHAN_API_BASE}/vault-data`;
export const WALLETCHAN_CLEAR_SIGNING_API = `${WALLETCHAN_API_BASE}/clearsigning/descriptor`;
export const WALLETCHAN_PIMLICO_PROXY_BASE = `${WALLETCHAN_API_BASE}/gas/pimlico`;
export const WALLETCHAN_DOMAIN_REPUTATION_API = `${WALLETCHAN_API_BASE}/domain-reputation`;

// ---------------------------------------------------------------------------
// WalletChan Assets & Pages
// ---------------------------------------------------------------------------
export const WALLETCHAN_ICON_URL = `${WALLETCHAN_SITE_URL}/images/walletchan-icon.png`;
export const WALLETCHAN_STAKE_URL = `${WALLETCHAN_SITE_URL}/stake`;
export const WALLETCHAN_OS_URL = `${WALLETCHAN_SITE_URL}/os`;
export const WALLETCHAN_MIGRATE_URL = `${WALLETCHAN_SITE_URL}/migrate`;
export const WALLETCHAN_SOURCE_URL =
  "https://github.com/apoorvlathey/walletchan";
export const WALLETCHAN_EXTENSION_LICENSE_URL =
  `${WALLETCHAN_SOURCE_URL}/blob/master/apps/extension/LICENSE.md`;
export const WALLETCHAN_THIRD_PARTY_NOTICES_URL =
  `${WALLETCHAN_SOURCE_URL}/blob/master/apps/extension/THIRD_PARTY_NOTICES.md`;
export const REVOKE_CASH_URL = "https://revoke.cash";
export const revokeCashAddressUrl = (address: string) =>
  `${REVOKE_CASH_URL}/address/${encodeURIComponent(address)}`;

// ---------------------------------------------------------------------------
// Bankr API
// ---------------------------------------------------------------------------
export const BANKR_API_BASE = "https://api.bankr.bot";
export const BANKR_BOT_API_PAGE = "https://bankr.bot/api";
export const BANKR_BOT_TERMINAL_PAGE = "https://bankr.bot/terminal";

// ---------------------------------------------------------------------------
// Social Links
// ---------------------------------------------------------------------------
export const TWITTER_URL = "https://x.com/apoorveth";
export const WALLETCHAN_TWITTER_URL = "https://x.com/WalletChan_";

// ---------------------------------------------------------------------------
// External APIs — Address Labels
// ---------------------------------------------------------------------------
export const ETH_SH_LABELS_BASE = "https://eth.sh/api/labels";
export const ethShLabelsUrl = (address: string, chainId: number) =>
  `${ETH_SH_LABELS_BASE}/${address}?chainId=${chainId}`;

// ---------------------------------------------------------------------------
// External APIs — Function Signature Lookup
// ---------------------------------------------------------------------------
export const FOURBYTE_SOURCIFY_LOOKUP_URL =
  "https://api.4byte.sourcify.dev/signature-database/v1/lookup";
export const FOURBYTE_DIRECTORY_API_URL =
  "https://www.4byte.directory/api/v1/signatures/";

// ---------------------------------------------------------------------------
// External APIs — Contract Source / ABI
// ---------------------------------------------------------------------------
export const SOURCIFY_BASE = "https://sourcify.dev/server/v2/contract";

// ---------------------------------------------------------------------------
// External APIs — Price Data
// ---------------------------------------------------------------------------
export const COINGECKO_PRICE_API =
  "https://api.coingecko.com/api/v3/simple/price";
export const COINGECKO_TOKEN_PRICE_API =
  "https://api.coingecko.com/api/v3/simple/token_price";
/**
 * GeckoTerminal — DEX-based onchain token price feed. Used as a fallback
 * for tokens CoinGecko's `/simple/token_price` endpoint doesn't index
 * (newer / lower-cap / DEX-only tokens). Endpoint shape:
 *   /simple/networks/{network}/token_price/{addresses}
 */
export const GECKOTERMINAL_TOKEN_PRICE_API =
  "https://api.geckoterminal.com/api/v2/simple/networks";
export const COINGECKO_MARKETS_API =
  "https://api.coingecko.com/api/v3/coins/markets";
export const COINGECKO_SEARCH_API =
  "https://api.coingecko.com/api/v3/search";

// ---------------------------------------------------------------------------
// External APIs — Google Favicons
// ---------------------------------------------------------------------------
export const googleFaviconUrl = (domain: string, size = 32) =>
  `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${domain}`)}&size=${size}`;

// ---------------------------------------------------------------------------
// Token Logos
// ---------------------------------------------------------------------------
export const USDC_LOGO_URL =
  "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png";

// ---------------------------------------------------------------------------
// IPFS Gateway
// ---------------------------------------------------------------------------
export const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
