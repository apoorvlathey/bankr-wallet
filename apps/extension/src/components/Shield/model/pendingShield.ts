import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resume the newest exact Shield confirmation instead of preparing another
 * durable operation after the user backs out of the normal review screen.
 */
export function findPendingShieldConfirmation(
  requests: readonly PendingTxRequest[],
): PendingTxRequest | null {
  for (let index = requests.length - 1; index >= 0; index -= 1) {
    const request = requests[index];
    if (
      request.trustedInternal === true &&
      UUID.test(request.id) &&
      request.privacyShieldMeta?.version === 1 &&
      request.privacyShieldMeta.operationId === request.id &&
      request.accountType !== "impersonator" &&
      typeof request.accountAddress === "string" &&
      request.tx.chainId === PRIVACY_POOLS_DEPLOYMENT.chainId &&
      request.tx.from.toLowerCase() === request.accountAddress.toLowerCase() &&
      request.tx.to?.toLowerCase() ===
        PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address.toLowerCase()
    ) {
      return request;
    }
  }
  return null;
}
