/** Trusted Wallet UI commands over the initialized WalletConnect client. */

import {
  cancelPendingRequestsForWalletConnectTopic,
  finalizeWalletConnectTopicTermination,
  resumeWalletConnectTopicAfterFailedTermination,
} from "../requests/pendingWalletConnectLifecycle";
import { getWalletConnectActiveChainId, setWalletConnectActiveChainByName } from "./chainState";
import {
  broadcastWalletConnectSessionsChanged,
  ensureWalletKit,
  getActiveWalletConnectSessionSummaries,
  getWalletConnectInitError,
  hasWalletConnectProjectId,
  initWalletConnect,
} from "./client";

export async function handleWalletConnectGetSessions() {
  const initialized = await initWalletConnect();
  return {
    success: initialized,
    sessions: getActiveWalletConnectSessionSummaries(),
    activeChainId: await getWalletConnectActiveChainId(),
    error: initialized
      ? undefined
      : getWalletConnectInitError() || "WalletConnect is not available",
    missingProjectId: !hasWalletConnectProjectId(),
  };
}

export async function handleWalletConnectPair(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed.startsWith("wc:")) {
    return { success: false, error: "Enter a valid WalletConnect URI" };
  }
  try {
    const kit = await ensureWalletKit();
    await kit.core.pairing.pair({ uri: trimmed });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to connect dapp",
    };
  }
}

export async function handleWalletConnectDisconnectSession(topic: string) {
  try {
    const kit = await ensureWalletKit();
    await cancelPendingRequestsForWalletConnectTopic(topic);
    await kit.disconnectSession({
      topic,
      reason: { code: 6000, message: "User disconnected the session" },
    });
    try {
      await finalizeWalletConnectTopicTermination(topic);
    } catch (error) {
      console.warn(
        "[WalletConnect] Session disconnected; pending-route cleanup deferred",
        error,
      );
    }
    void broadcastWalletConnectSessionsChanged();
    return { success: true };
  } catch (error) {
    resumeWalletConnectTopicAfterFailedTermination(topic);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to disconnect dapp",
    };
  }
}

export async function handleWalletConnectSwitchChain(chainName: string) {
  try {
    const kit = await ensureWalletKit();
    const chain = await setWalletConnectActiveChainByName(kit, chainName);
    return { success: true, chainId: chain.chainId, chainName: chain.name };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to switch chain",
    };
  }
}
