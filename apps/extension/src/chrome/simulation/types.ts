import type { Address } from "viem";

import type { NftMetadata } from "../nftMetadata";

export type NftStandard = "erc721" | "erc1155";

/** NFT-specific data attached to an asset change. */
export interface NftAssetInfo {
  standard: NftStandard;
  /** Decimal token ID, or null when only the collection-count delta is known. */
  tokenId: string | null;
  /** Stringified amount, or null when only the collection-count delta is known. */
  amount: string | null;
  /** Post-transaction URI captured inside the simulator. */
  tokenUri?: string;
  metadata?: NftMetadata;
  metadataLoading?: boolean;
}

export interface AssetChange {
  /** Token contract address, or `native` for the chain currency. */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  rawDelta: string;
  formattedAmount: string;
  valueUsd: number | null;
  direction: "in" | "out";
  nft?: NftAssetInfo;
}

export interface SimulationResult {
  txSuccess: boolean;
  nativeChange: AssetChange | null;
  tokenChanges: AssetChange[];
  simulationFailed: boolean;
  simulationError?: string;
  metadataComplete: boolean;
}

export interface TokenMetadataResult {
  tokenChanges: AssetChange[];
  nativeChange?: AssetChange | null;
}

/** Shape of NFT receipts decoded from the simulator return value. */
export interface RawNftReceived {
  token: Address;
  tokenId: bigint;
  amount: bigint;
  standard: number;
  tokenUriRaw: `0x${string}`;
}

/** Normalized result shared by single and batch bytecode simulations. */
export interface RawSimulationResult {
  txSuccess: boolean;
  ethDelta: bigint;
  tokens: Address[];
  deltas: bigint[];
  nftsReceived: RawNftReceived[];
}
