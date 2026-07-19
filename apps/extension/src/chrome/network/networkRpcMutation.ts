import type { NetworkEntry } from "@/types";
import { cleanSavedRpcEndpoints } from "./customNetworkValidation";
import {
  getNetworkRpcEndpoints,
  moveNetworkRpcEndpoints,
} from "./rpcHistoryRepository";

export async function reconcileNetworkRpcEndpoints(args: {
  current: NetworkEntry;
  savedChainId: number;
  savedRpcUrl: string;
  requestedRpcEndpoints?: unknown;
}): Promise<void> {
  const { current, savedChainId, savedRpcUrl, requestedRpcEndpoints } = args;
  if (requestedRpcEndpoints !== undefined) {
    const cleanedRpcEndpoints = cleanSavedRpcEndpoints(
      requestedRpcEndpoints,
      savedRpcUrl,
    );
    await moveNetworkRpcEndpoints(
      current.chainId,
      savedChainId,
      savedRpcUrl,
      cleanedRpcEndpoints,
    );
    return;
  }

  if (savedRpcUrl === current.rpcUrl && savedChainId === current.chainId) return;
  const existingRpcEndpoints = await getNetworkRpcEndpoints(
    current.chainId,
    current.rpcUrl,
  );
  await moveNetworkRpcEndpoints(
    current.chainId,
    savedChainId,
    savedRpcUrl,
    [...existingRpcEndpoints, { url: current.rpcUrl }],
  );
}
