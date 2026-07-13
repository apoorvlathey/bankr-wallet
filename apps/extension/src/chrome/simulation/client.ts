import { createPublicClient, type PublicClient } from "viem";

import { secureHttpTransport } from "../network/rpcClient";
import { getRpcUrl } from "../txHandlers";

const RPC_TIMEOUT = 10_000;
const clientCache = new Map<
  number,
  { rpcUrl: string; client: PublicClient }
>();

export async function getSimulationClient(
  chainId: number,
): Promise<PublicClient | null> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;

  const cached = clientCache.get(chainId);
  if (cached && cached.rpcUrl === rpcUrl) return cached.client;

  const client = createPublicClient({
    transport: secureHttpTransport(rpcUrl, {
      timeout: RPC_TIMEOUT,
      retryCount: 1,
    }),
  });
  clientCache.set(chainId, { rpcUrl, client });
  return client;
}
