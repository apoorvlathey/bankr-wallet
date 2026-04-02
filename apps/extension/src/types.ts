export interface NetworkEntry {
  chainId: number;
  rpcUrl: string;
  /**
   * Runtime overrides only. Built-in chain identity still comes from
   * CHAIN_REGISTRY; use `lib/chains.ts` to merge registry + storage instead of
   * reading `networksInfo` directly in UI/background code.
   */
  /** True for user-added chains (not in CHAIN_REGISTRY) */
  isCustom?: boolean;
  /** Hide from chain selector (for hardcoded chains the user wants to hide) */
  hidden?: boolean;
  /** Block explorer URL (required for custom chains) */
  explorer?: string;
  /** Native currency info (required for custom chains, defaults to ETH) */
  nativeCurrency?: { name: string; symbol: string; decimals: number };
}

export type NetworksInfo = {
  [name: string]: NetworkEntry;
};
