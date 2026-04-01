/**
 * Centralized external URL constants for the extension.
 * Keep all API endpoints, service URLs, and external links here
 * so they're easy to find, audit, and update.
 */

// ---------------------------------------------------------------------------
// WalletChan APIs
// ---------------------------------------------------------------------------
export const WALLETCHAN_API_BASE = "https://walletchan.com/api";
export const WALLETCHAN_PORTFOLIO_API = `${WALLETCHAN_API_BASE}/portfolio`;
export const WALLETCHAN_SWAP_API_BASE = `${WALLETCHAN_API_BASE}/swap`;
export const WALLETCHAN_SPONSORED_TRANSFER_API = `${WALLETCHAN_API_BASE}/sponsored-transfer`;
export const WALLETCHAN_PREMIUM_STATUS_API = `${WALLETCHAN_API_BASE}/premium-status`;
export const WALLETCHAN_VAULT_DATA_API = `${WALLETCHAN_API_BASE}/vault-data`;

// ---------------------------------------------------------------------------
// WalletChan Assets & Pages
// ---------------------------------------------------------------------------
export const WALLETCHAN_ICON_URL = "https://walletchan.com/images/walletchan-icon.png";
export const WALLETCHAN_STAKE_URL = "https://stake.walletchan.com";
export const WALLETCHAN_OS_URL = "https://os.walletchan.com";

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
export const COINGECKO_MARKETS_API =
  "https://api.coingecko.com/api/v3/coins/markets";
export const COINGECKO_SEARCH_API =
  "https://api.coingecko.com/api/v3/search";

// ---------------------------------------------------------------------------
// External APIs — Google Favicons
// ---------------------------------------------------------------------------
export const googleFaviconUrl = (domain: string, size = 32) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;

// ---------------------------------------------------------------------------
// Token Logos
// ---------------------------------------------------------------------------
export const USDC_LOGO_URL =
  "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png";

// ---------------------------------------------------------------------------
// IPFS Gateway
// ---------------------------------------------------------------------------
export const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
