import { createPublicClient, parseAbi } from "viem";

import { secureHttpTransport } from "../../network/rpcClient";
import { PRIVACY_POOLS_VIEM_CHAIN } from "../deployment/chain";
import { resolvePrivacyPoolsRpcUrl } from "../deployment/health";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import { PRIVACY_POOLS_RPC_BATCH_SIZE } from "../rpcPolicy";
import { PRIVACY_SNARK_SCALAR_FIELD } from "./types";

const ENTRYPOINT_ABI = parseAbi([
  "function associationSets(uint256 scope) view returns (uint256 root, string ipfsCID, uint256 timestamp)",
]);
const POOL_ABI = parseAbi([
  "function currentRoot() view returns (uint256)",
]);

export interface PrivacyAspOnchainRoots {
  associationRoot: bigint;
  stateRoot: bigint;
  associationTimestamp: bigint;
}

export async function readPrivacyAspOnchainRoots(
  rpcUrl?: string,
): Promise<PrivacyAspOnchainRoots> {
  const resolvedRpcUrl = rpcUrl ?? await resolvePrivacyPoolsRpcUrl();
  const deployment = PRIVACY_POOLS_DEPLOYMENT;
  const client = createPublicClient({
    chain: PRIVACY_POOLS_VIEM_CHAIN,
    transport: secureHttpTransport(resolvedRpcUrl, {
      batch: { batchSize: PRIVACY_POOLS_RPC_BATCH_SIZE, wait: 0 },
      retryCount: 1,
      timeout: 12_000,
    }),
  });
  const [associationSet, stateRoot] = await Promise.all([
    client.readContract({
      address: deployment.contracts.entrypointProxy.address,
      abi: ENTRYPOINT_ABI,
      functionName: "associationSets",
      args: [deployment.scope],
    }),
    client.readContract({
      address: deployment.contracts.ethPool.address,
      abi: POOL_ABI,
      functionName: "currentRoot",
    }),
  ]);
  const [associationRoot, ipfsCID, associationTimestamp] = associationSet;
  if (
    associationRoot <= 0n ||
    associationRoot >= PRIVACY_SNARK_SCALAR_FIELD ||
    stateRoot <= 0n ||
    stateRoot >= PRIVACY_SNARK_SCALAR_FIELD ||
    typeof ipfsCID !== "string" ||
    ipfsCID.length > 2_048 ||
    associationTimestamp < 0n
  ) {
    throw new Error("Invalid onchain ASP roots");
  }
  return { associationRoot, stateRoot, associationTimestamp };
}
