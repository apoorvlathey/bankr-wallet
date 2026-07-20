import { createPublicClient, parseAbi } from "viem";

import { secureHttpTransport } from "../../network/rpcClient";
import { PRIVACY_POOLS_VIEM_CHAIN } from "../deployment/chain";
import { resolvePrivacyPoolsRpcUrl } from "../deployment/health";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import { PRIVACY_POOLS_RPC_BATCH_SIZE } from "../rpcPolicy";

const POOL_ABI = parseAbi([
  "function nullifierHashes(uint256 nullifierHash) view returns (bool)",
]);

export async function isPrivacyNullifierSpent(nullifier: bigint): Promise<boolean> {
  if (nullifier <= 0n) throw new Error("Invalid Privacy Pools nullifier");
  const rpcUrl = await resolvePrivacyPoolsRpcUrl();
  const client = createPublicClient({
    chain: PRIVACY_POOLS_VIEM_CHAIN,
    transport: secureHttpTransport(rpcUrl, {
      batch: { batchSize: PRIVACY_POOLS_RPC_BATCH_SIZE, wait: 0 },
      retryCount: 1,
      timeout: 12_000,
    }),
  });
  return client.readContract({
    address: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
    abi: POOL_ABI,
    functionName: "nullifierHashes",
    args: [nullifier],
  });
}
