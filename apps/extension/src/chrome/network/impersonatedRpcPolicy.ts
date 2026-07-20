import { normalizeSavedRpcEndpoints } from "@/lib/chains";
import { getNetworkRpcEndpoints } from "./rpcHistoryRepository";

/** Exact selected-endpoint opt-in; malformed or legacy history stays disabled. */
export async function allowsImpersonatedTransactions(
  chainId: unknown,
  activeRpcUrl: unknown,
): Promise<boolean> {
  const activeUrl = normalizeSavedRpcEndpoints(activeRpcUrl, undefined)[0]?.url;
  if (!activeUrl) return false;
  const endpoints = await getNetworkRpcEndpoints(chainId, activeUrl);
  return endpoints.some(
    (endpoint) =>
      endpoint.url === activeUrl && endpoint.allowImpersonatedTransactions === true,
  );
}
