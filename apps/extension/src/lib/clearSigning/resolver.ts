/**
 * Client-side descriptor resolver. Sends a message to the background service
 * worker (which owns the chrome.storage cache + network fetch) and returns the
 * descriptor JSON or null.
 *
 * The background handler lives in chrome/clearSigningHandlers.ts.
 */

import type { DescriptorKind, Erc7730Descriptor } from "./types";

export interface ResolveRequest {
  chainId: number;
  address: string;
  kind: DescriptorKind;
}

export interface ResolveResult {
  descriptor: Erc7730Descriptor | null;
  /** Whether clear signing is enabled globally. */
  enabled: boolean;
}

export async function resolveDescriptor(req: ResolveRequest): Promise<ResolveResult> {
  if (!req.address || !req.chainId || !req.kind) {
    return { descriptor: null, enabled: true };
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_CLEAR_SIGNING_DESCRIPTOR",
      chainId: req.chainId,
      address: req.address.toLowerCase(),
      kind: req.kind,
    });

    if (!response || typeof response !== "object") {
      return { descriptor: null, enabled: true };
    }

    return {
      descriptor: (response as { descriptor?: Erc7730Descriptor | null }).descriptor || null,
      enabled: (response as { enabled?: boolean }).enabled !== false,
    };
  } catch (err) {
    console.warn("[clear-signing] resolveDescriptor failed:", err);
    return { descriptor: null, enabled: true };
  }
}

export async function invalidateClearSigningCache(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "INVALIDATE_CLEAR_SIGNING_CACHE" });
  } catch (err) {
    console.warn("[clear-signing] invalidate failed:", err);
  }
}
