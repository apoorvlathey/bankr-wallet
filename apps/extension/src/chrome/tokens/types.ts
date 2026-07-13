export interface CustomToken {
  /** Storage invariant: always lowercase. */
  contractAddress: string;
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  /** Optional image supplied by wallet_watchAsset. */
  image?: string;
  addedAt: number;
}

export interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
}

export interface NftMetadata {
  name?: string;
  description?: string;
  /** Safe renderer source: public HTTPS or bounded raster data only. */
  image?: string;
}

export interface PreflightTokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}
