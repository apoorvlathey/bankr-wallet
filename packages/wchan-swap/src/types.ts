import type { Address } from "viem";

export type SwapDirection = "buy" | "sell";
export type SwapRoute = "direct" | "via-bnkrw";
export type RoutePreference = "auto" | "direct" | "via-bnkrw";

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface WchanQuote {
  amountIn: bigint;
  amountOut: bigint;
  direction: SwapDirection;
  route: SwapRoute;
  /** V4 quoter's gas estimate for the swap call itself (excludes UR/wrap overhead). */
  gasEstimate: bigint;
}

export interface SwapConfig {
  chainId: number;
  slippageBps: number;
  deadline: number; // seconds from now
}
