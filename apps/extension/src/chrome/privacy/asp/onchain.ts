import { createPublicClient, parseAbi } from "viem";
import { sepolia } from "viem/chains";

import { secureHttpTransport } from "../../network/rpcClient";
import { resolvePrivacyPoolsSepoliaRpcUrl } from "../deployment/health";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
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
  const resolvedRpcUrl = rpcUrl ?? await resolvePrivacyPoolsSepoliaRpcUrl();
  const deployment = PRIVACY_POOLS_SEPOLIA_DEPLOYMENT;
  const client = createPublicClient({
    chain: sepolia,
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
