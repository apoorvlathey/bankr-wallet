import type { DefiPosition, PortfolioToken } from "./api";

export interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
}

export interface PortfolioTokenCatalog {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  customTokenKeys: Set<string>;
  recentReceivedTokenKeys: Set<string>;
  allTokenKeys: Set<string>;
  hiddenTokenKeys: Set<string>;
  /** True when native-only fallback is rendering after portfolio API failure. */
  apiUnavailable: boolean;
}

export interface LoadPortfolioTokenCatalogOptions {
  /** Skip metadata and pricing fallback so primary holdings can paint first. */
  enrich?: boolean;
  /** Allow external ERC-20 pricing fallback for tokens without API prices. */
  includeErc20PriceFallback?: boolean;
  /** Restrict enrichment to currently visible token keys. */
  enrichTokenKeys?: Set<string>;
}
