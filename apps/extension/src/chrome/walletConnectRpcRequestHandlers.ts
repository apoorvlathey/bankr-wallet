import {
  getResolvedChainById,
  getStoredNetworksInfo,
  getStoredRpcUrl,
} from "@/lib/chains";
import { setWalletConnectActiveKnownChain } from "./walletConnectChainState";
import {
  parseWalletChainId,
  sessionSupportsChain,
} from "./walletConnectHelpers";
import {
  rejectSessionRequest,
  respondSessionRequest,
  type WalletKitLike,
} from "./walletConnectProtocol";

export async function handleSwitchEthereumChain(
  kit: WalletKitLike,
  args: any,
  params: any[],
): Promise<void> {
  const targetChainId = parseWalletChainId(params?.[0]?.chainId);
  if (!targetChainId) {
    throw new Error("Invalid chainId");
  }
  if (!sessionSupportsChain(kit.getActiveSessions()?.[args.topic], targetChainId)) {
    await rejectSessionRequest(kit, args, 4902, "Unrecognized chain");
    return;
  }
  try {
    await setWalletConnectActiveKnownChain(kit, targetChainId, {
      emitEvents: true,
    });
  } catch {
    await rejectSessionRequest(kit, args, 4902, "Unrecognized chain");
    return;
  }
  await respondSessionRequest(kit, args, null);
}

export async function handleAddEthereumChain(
  kit: WalletKitLike,
  args: any,
  params: any[],
): Promise<void> {
  const targetChainId = parseWalletChainId(params?.[0]?.chainId);
  if (!targetChainId) {
    throw new Error("Invalid chainId");
  }
  const chain = getResolvedChainById(targetChainId, await getStoredNetworksInfo());
  if (!chain) {
    await rejectSessionRequest(
      kit,
      args,
      4902,
      "Add this chain in WalletChan settings first",
    );
    return;
  }
  await respondSessionRequest(kit, args, null);
}

export async function forwardSafeRpcRequest(
  chainId: number,
  method: string,
  params: any[],
): Promise<unknown> {
  const rpcUrl = await getStoredRpcUrl(chainId);
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `RPC request failed: ${response.status}`);
  }
  return data.result;
}
