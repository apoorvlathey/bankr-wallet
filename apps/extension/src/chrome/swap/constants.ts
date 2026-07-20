import { WALLETCHAN_SWAP_API_BASE } from "@/constants/externalUrls";

export const NATIVE_TOKEN_ADDRESS =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const DEFAULT_SLIPPAGE_BPS = 500;
export const SLIPPAGE_PRESETS = [100, 300, 500];

export const SWAP_API_BASE = WALLETCHAN_SWAP_API_BASE;
export const SWAP_RPC_TIMEOUT_MS = 8_000;
export const SWAP_REQUEST_TIMEOUT_MS = 15_000;
export const TOKEN_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const TOKEN_METADATA_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const TOKEN_LOGO_MISS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const SWAP_QUOTE_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const SWAP_CATALOG_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const TOKEN_PRICE_RESPONSE_MAX_BYTES = 64 * 1024;
