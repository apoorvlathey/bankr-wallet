import { createPublicClient, parseAbi } from "viem";
import { sepolia } from "viem/chains";

import { secureHttpTransport } from "../../network/rpcClient";
import { resolvePrivacyPoolsSepoliaRpcUrl } from "../deployment/health";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
import { PRIVACY_POOLS_RPC_BATCH_SIZE } from "../rpcPolicy";

const POOL_ABI = parseAbi([
  "function nullifierHashes(uint256 nullifierHash) view returns (bool)",
]);

export async function isPrivacyNullifierSpent(nullifier: bigint): Promise<boolean> {
  if (nullifier <= 0n) throw new Error("Invalid Privacy Pools nullifier");
  const rpcUrl = await resolvePrivacyPoolsSepoliaRpcUrl();
  const client = createPublicClient({
    chain: sepolia,
    transport: secureHttpTransport(rpcUrl, {
      batch: { batchSize: PRIVACY_POOLS_RPC_BATCH_SIZE, wait: 0 },
      retryCount: 1,
      timeout: 12_000,
    }),
  });
  return client.readContract({
    address: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
    abi: POOL_ABI,
    functionName: "nullifierHashes",
    args: [nullifier],
  });
}
