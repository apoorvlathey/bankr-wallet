import { encodeFunctionData } from "viem";
import { fetchRpcResult } from "../network/rpcClient";
import type { SponsoredTransferRelayPayload } from "./intentStorage";

const BASE_RECONCILIATION_RPCS = [
  "https://mainnet.base.org",
  "https://base.drpc.org",
] as const;

const AUTHORIZATION_STATE_ABI = [
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export interface SponsoredAuthorizationObservation {
  used: boolean;
  blockTimestamp: number;
}

export type SponsoredAuthorizationResolution =
  | "consumed"
  | "expired-unused"
  | "unresolved";

export function classifySponsoredAuthorizationObservations(
  observations: SponsoredAuthorizationObservation[],
  validBefore: number,
): SponsoredAuthorizationResolution {
  if (
    observations.length !== BASE_RECONCILIATION_RPCS.length ||
    !Number.isSafeInteger(validBefore) ||
    validBefore <= 0
  ) {
    return "unresolved";
  }
  if (observations.every((observation) => observation.used)) {
    return "consumed";
  }
  if (
    observations.every(
      (observation) =>
        !observation.used && observation.blockTimestamp >= validBefore,
    )
  ) {
    return "expired-unused";
  }
  return "unresolved";
}

function parseBlockTimestamp(block: unknown): number {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    throw new Error("Base RPC returned an invalid block");
  }
  const raw = (block as Record<string, unknown>).timestamp;
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("Base RPC returned an invalid block timestamp");
  }
  const timestamp = Number(BigInt(raw));
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error("Base RPC returned an invalid block timestamp");
  }
  return timestamp;
}

function parseBlockNumber(block: unknown): string {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    throw new Error("Base RPC returned an invalid block");
  }
  const raw = (block as Record<string, unknown>).number;
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("Base RPC returned an invalid block number");
  }
  return raw;
}

function parseAuthorizationState(value: unknown): boolean {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("Base RPC returned an invalid authorization state");
  }
  const numeric = BigInt(value);
  if (numeric !== 0n && numeric !== 1n) {
    throw new Error("Base RPC returned an invalid authorization state");
  }
  return numeric === 1n;
}

async function observeAuthorization(
  rpcUrl: string,
  payload: SponsoredTransferRelayPayload,
): Promise<SponsoredAuthorizationObservation> {
  const data = encodeFunctionData({
    abi: AUTHORIZATION_STATE_ABI,
    functionName: "authorizationState",
    args: [
      payload.from as `0x${string}`,
      payload.nonce as `0x${string}`,
    ],
  });
  // Pin both observations to the same finalized block. Reading latest state
  // and timestamp concurrently can mix different blocks and falsely classify
  // an authorization as expired-but-unused while it is being consumed.
  const block = await fetchRpcResult(
    rpcUrl,
    "eth_getBlockByNumber",
    ["finalized", false],
    { timeoutMs: 10_000, maxResponseBytes: 256 * 1024 },
  );
  const blockNumber = parseBlockNumber(block);
  const state = await fetchRpcResult(
    rpcUrl,
    "eth_call",
    [{ to: BASE_USDC_ADDRESS, data }, blockNumber],
    { timeoutMs: 10_000, maxResponseBytes: 64 * 1024 },
  );
  return {
    used: parseAuthorizationState(state),
    blockTimestamp: parseBlockTimestamp(block),
  };
}

/**
 * Resolve an ambiguous one-time authorization using independent chain views.
 * Any RPC failure or disagreement stays fail-closed; local wall time is never
 * accepted as proof that an authorization can no longer execute.
 */
export async function reconcileSponsoredTransferAuthorization(
  payload: SponsoredTransferRelayPayload,
  validBefore: number,
): Promise<SponsoredAuthorizationResolution> {
  try {
    const observations = await Promise.all(
      BASE_RECONCILIATION_RPCS.map((rpcUrl) =>
        observeAuthorization(rpcUrl, payload),
      ),
    );
    return classifySponsoredAuthorizationObservations(
      observations,
      validBefore,
    );
  } catch {
    return "unresolved";
  }
}
