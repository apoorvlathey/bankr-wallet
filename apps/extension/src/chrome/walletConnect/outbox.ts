import {
  getWalletConnectPendingRequests,
  removeWalletConnectPendingRequest,
} from "./storage";
import {
  replayWalletConnectTerminalResponse,
  type WalletKitLike,
} from "./protocol";

/**
 * Replays terminal JSON-RPC responses that were durably stored before an
 * ambiguous relay failure. A route is cleared only after delivery succeeds or
 * WalletKit confirms the owning session no longer exists.
 */
export async function flushWalletConnectTerminalResponses(
  kit: WalletKitLike,
): Promise<void> {
  const routes = Object.values(await getWalletConnectPendingRequests());
  const activeSessions = kit.getActiveSessions() || {};
  await Promise.allSettled(
    routes
      .filter((route) => route.terminalResponse)
      .map(async (route) => {
        if (!activeSessions[route.topic]) {
          await removeWalletConnectPendingRequest(route.id);
          return;
        }
        await replayWalletConnectTerminalResponse(kit, route);
      }),
  );
}
