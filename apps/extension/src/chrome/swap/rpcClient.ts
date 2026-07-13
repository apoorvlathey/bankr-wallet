import { createPublicClient } from "viem";
import { getRpcUrl } from "../txHandlers";
import { secureHttpTransport } from "../network/rpcClient";
import { SWAP_RPC_TIMEOUT_MS } from "./constants";

export async function createSwapPublicClient(chainId: number) {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;
  return createPublicClient({
    transport: secureHttpTransport(rpcUrl, {
      timeout: SWAP_RPC_TIMEOUT_MS,
      retryCount: 0,
    }),
  });
}
