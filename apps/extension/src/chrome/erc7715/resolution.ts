import type { Erc7715PermissionResult } from "./types";
import {
  beginExternalPendingRequestResolution,
  finishExternalPendingRequestResolution,
} from "../requests/pendingRequestResolution";

/**
 * A permission prompt can be rendered in more than one extension surface
 * (popup, side panel, or full-page view). Keep approval and rejection on the
 * same per-request single-flight so only the first user action can resolve it.
 */
const inFlightResolutions = new Map<
  string,
  Promise<Erc7715PermissionResult>
>();

export function runErc7715PermissionResolution(
  requestId: string,
  resolve: () => Promise<Erc7715PermissionResult>,
): Promise<Erc7715PermissionResult> {
  const existing = inFlightResolutions.get(requestId);
  if (existing) return existing;

  const externalKey = `erc7715Permission:${requestId}`;
  const resetBarrierToken = beginExternalPendingRequestResolution(externalKey);
  if (!resetBarrierToken) {
    return Promise.resolve({
      success: false,
      error: "Wallet reset is currently in progress",
    });
  }

  // Defer the callback to a microtask so the claim is installed before any of
  // its asynchronous work starts. This makes the first action deterministic.
  const resolution = Promise.resolve().then(resolve);
  inFlightResolutions.set(requestId, resolution);

  const releaseClaim = () => {
    if (inFlightResolutions.get(requestId) === resolution) {
      inFlightResolutions.delete(requestId);
    }
    finishExternalPendingRequestResolution(externalKey, resetBarrierToken);
  };
  // Fulfilled terminal or recoverable pre-effect work releases both gates.
  // An unexpected rejection is ambiguous after onchain grant/signing work, so
  // retain both claims fail-closed until the service worker restarts.
  void resolution.then(releaseClaim, () => undefined);

  return resolution;
}

export function isErc7715PermissionResolutionInFlight(
  requestId: string,
): boolean {
  return inFlightResolutions.has(requestId);
}
