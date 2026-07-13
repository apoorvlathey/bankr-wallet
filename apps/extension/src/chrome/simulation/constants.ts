import type { Address } from "viem";

/**
 * Conservative cap for access-list and single-call simulation RPCs. Several
 * providers reject auto-filled or explicit values near the block gas limit;
 * 10M remains above the simulator's typical pre/call/post balance sweep.
 */
export const SIMULATION_GAS_LIMIT = 10_000_000n;

/**
 * Sequential batches need more headroom because every call and every
 * candidate's pre/post balance probe runs in one eth_call. This higher value is
 * never used for the more tightly capped eth_createAccessList request.
 */
export const BATCH_SIMULATION_GAS_LIMIT = 50_000_000n;

/** Permit2 is deployed at the same address on every supported chain. */
export const PERMIT2_ADDRESS: Address =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3";
