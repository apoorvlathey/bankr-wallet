import {
  getResolvedChainById,
  getStoredNetworksInfo,
  getStoredRpcUrl,
} from "@/lib/chains";
import { setWalletConnectActiveKnownChain } from "./chainState";
import {
  parseWalletChainId,
  sessionSupportsChain,
} from "./sessionPolicy";
import {
  rejectSessionRequest,
  respondSessionRequest,
  type WalletKitLike,
} from "./protocol";
import { forwardSafeRpcRequestToTrustedUrl } from "../safeRpcForwarding";

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
  // A remote relay peer must never gain a less-bounded network proxy than a
  // connected webpage. The RPC target is trusted only because it was resolved
  // from WalletChan's stored chain configuration above.
  return forwardSafeRpcRequestToTrustedUrl(rpcUrl, method, params);
}
