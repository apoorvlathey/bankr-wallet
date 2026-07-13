import { getStoredRpcUrl } from "@/lib/chains";

/** Resolves transaction RPC configuration through the shared chain registry. */
export async function getRpcUrl(
  chainId: number,
): Promise<string | undefined> {
  return getStoredRpcUrl(chainId);
}
