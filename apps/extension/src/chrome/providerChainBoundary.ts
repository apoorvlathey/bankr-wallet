import type { NetworksInfo } from "../types";

export type ProviderChainBoundaryResult =
  | { valid: true; chainId: number }
  | { valid: false; error: string };

/**
 * Parse the chain-id representations accepted by EIP-1193/EIP-5792 without
 * allowing precision loss or coercion of arbitrary values.
 */
export function parseProviderChainId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 66 ||
    (!/^[1-9][0-9]*$/.test(value) && !/^0x[0-9a-fA-F]+$/.test(value))
  ) {
    return null;
  }

  try {
    const parsed = BigInt(value);
    if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(parsed);
  } catch {
    return null;
  }
}

/**
 * Resolve the active chain from content-script-owned state and the extension's
 * network registry. Page-supplied request fields are never inputs here.
 */
export function resolveProviderActiveChainId(
  chainName: unknown,
  networksInfo: NetworksInfo | undefined,
): number | null {
  if (typeof chainName !== "string" || !chainName || !networksInfo) return null;
  return parseProviderChainId(networksInfo[chainName]?.chainId);
}

/**
 * Require the dapp-requested chain to equal the content-script-attested active
 * chain. The attested value is copied into the runtime message and validated a
 * second time by the background router.
 */
export function validateProviderChainBoundary(
  requestedChainId: unknown,
  providerChainId: unknown,
): ProviderChainBoundaryResult {
  const active = parseProviderChainId(providerChainId);
  if (!active) {
    return { valid: false, error: "Wallet active chain is unavailable" };
  }

  const requested = parseProviderChainId(requestedChainId);
  if (!requested) {
    return { valid: false, error: "Request must include a valid chainId" };
  }

  if (requested !== active) {
    return {
      valid: false,
      error: "Request chainId does not match WalletChan's active chain",
    };
  }

  return { valid: true, chainId: active };
}
