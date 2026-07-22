import { createPublicClient, parseAbi } from "viem";

import { secureHttpTransport } from "../../network/rpcClient";
import { PRIVACY_POOLS_VIEM_CHAIN } from "../deployment/chain";
import { resolvePrivacyPoolsRpcUrl } from "../deployment/health";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import { PRIVACY_POOLS_RPC_BATCH_SIZE } from "../rpcPolicy";
import { PRIVACY_SNARK_SCALAR_FIELD } from "./types";

const ENTRYPOINT_ABI = parseAbi([
  "function latestRoot() view returns (uint256)",
]);
const POOL_ABI = parseAbi([
  "function currentRoot() view returns (uint256)",
  "function currentRootIndex() view returns (uint32)",
  "function roots(uint256 index) view returns (uint256)",
]);

// Privacy Pools' State contract retains roots in a fixed-size circular buffer.
// This must remain aligned with the deployed contract's ROOT_HISTORY_SIZE.
export const PRIVACY_POOL_ROOT_HISTORY_SIZE = 64;

export interface PrivacyAspOnchainRoots {
  associationRoot: bigint;
  verifiedStateRoot: bigint;
}

export function privacyPoolHistoricalRootIndices(
  currentRootIndex: number,
): number[] {
  if (
    !Number.isSafeInteger(currentRootIndex) ||
    currentRootIndex < 0 ||
    currentRootIndex >= PRIVACY_POOL_ROOT_HISTORY_SIZE
  ) {
    throw new Error("Invalid Privacy Pools root index");
  }
  return Array.from(
    { length: PRIVACY_POOL_ROOT_HISTORY_SIZE - 1 },
    (_, offset) =>
      (currentRootIndex - offset - 1 + PRIVACY_POOL_ROOT_HISTORY_SIZE) %
      PRIVACY_POOL_ROOT_HISTORY_SIZE,
  );
}

export async function isPrivacyPoolStateRootKnown(input: {
  expectedStateRoot: bigint;
  currentStateRoot: bigint;
  readCurrentRootIndex: () => Promise<number>;
  readHistoricalRoots: (indices: readonly number[]) => Promise<readonly bigint[]>;
}): Promise<boolean> {
  if (input.expectedStateRoot === input.currentStateRoot) return true;
  const indices = privacyPoolHistoricalRootIndices(
    await input.readCurrentRootIndex(),
  );
  const historicalRoots = await input.readHistoricalRoots(indices);
  if (historicalRoots.length !== indices.length) {
    throw new Error("Incomplete Privacy Pools root history");
  }
  return historicalRoots.some((root) => root === input.expectedStateRoot);
}

export async function readPrivacyAspOnchainRoots(options: {
  expectedStateRoot: bigint;
  rpcUrl?: string;
}): Promise<PrivacyAspOnchainRoots> {
  const { expectedStateRoot } = options;
  if (
    expectedStateRoot <= 0n ||
    expectedStateRoot >= PRIVACY_SNARK_SCALAR_FIELD
  ) {
    throw new Error("Invalid expected Privacy Pools state root");
  }
  const resolvedRpcUrl = options.rpcUrl ?? await resolvePrivacyPoolsRpcUrl();
  const deployment = PRIVACY_POOLS_DEPLOYMENT;
  const client = createPublicClient({
    chain: PRIVACY_POOLS_VIEM_CHAIN,
    transport: secureHttpTransport(resolvedRpcUrl, {
      batch: { batchSize: PRIVACY_POOLS_RPC_BATCH_SIZE, wait: 0 },
      retryCount: 1,
      timeout: 12_000,
    }),
  });
  const [associationRoot, currentStateRoot] = await Promise.all([
    client.readContract({
      address: deployment.contracts.entrypointProxy.address,
      abi: ENTRYPOINT_ABI,
      functionName: "latestRoot",
    }),
    client.readContract({
      address: deployment.contracts.ethPool.address,
      abi: POOL_ABI,
      functionName: "currentRoot",
    }),
  ]);
  if (
    associationRoot <= 0n ||
    associationRoot >= PRIVACY_SNARK_SCALAR_FIELD ||
    currentStateRoot <= 0n ||
    currentStateRoot >= PRIVACY_SNARK_SCALAR_FIELD
  ) {
    throw new Error("Invalid onchain ASP roots");
  }
  const stateRootKnown = await isPrivacyPoolStateRootKnown({
    expectedStateRoot,
    currentStateRoot,
    readCurrentRootIndex: async () => Number(await client.readContract({
      address: deployment.contracts.ethPool.address,
      abi: POOL_ABI,
      functionName: "currentRootIndex",
    })),
    readHistoricalRoots: async (indices) =>
      await client.multicall({
        allowFailure: false,
        contracts: indices.map((index) => ({
          address: deployment.contracts.ethPool.address,
          abi: POOL_ABI,
          functionName: "roots" as const,
          args: [BigInt(index)] as const,
        })),
      }) as readonly bigint[],
  });
  if (!stateRootKnown) {
    throw new Error("ASP state root is not in the Privacy Pools root history");
  }
  return { associationRoot, verifiedStateRoot: expectedStateRoot };
}
