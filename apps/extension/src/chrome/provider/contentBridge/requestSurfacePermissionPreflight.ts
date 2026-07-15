import { EIP7702_SUPPORTED_CHAIN_IDS } from "@/constants/chainRegistry";
import { KNOWN_CHAIN_IDS } from "@/constants/knownChains.generated";
import { validateErc7715PermissionRequestPayload } from "../../erc7715/permissionValidation";
import {
  normalizePreflightAddress,
  parseHexChainId,
} from "../../erc7715/preflightNormalization";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDefaultDelegateForChain(chainId: number): boolean {
  return (
    EIP7702_SUPPORTED_CHAIN_IDS.has(chainId) || KNOWN_CHAIN_IDS.has(chainId)
  );
}

/** Mirrors request-only ERC-7715 rejection policy before RPC eligibility. */
export function permissionPassesSurfacePreflight(
  params: unknown,
  activeChainId: unknown,
  accountType: string,
  activeAddress: string,
): boolean {
  if (
    (accountType !== "privateKey" && accountType !== "seedPhrase") ||
    !Array.isArray(params) ||
    params.length !== 1 ||
    !isRecord(params[0])
  ) {
    return false;
  }

  const request = params[0];
  const requestChainId = parseHexChainId(request.chainId);
  if (
    !requestChainId ||
    requestChainId !== activeChainId ||
    !hasDefaultDelegateForChain(requestChainId)
  ) {
    return false;
  }

  try {
    if (
      request.from !== undefined &&
      normalizePreflightAddress(
        request.from,
        "Permission request from address",
      ).toLowerCase() !== activeAddress.toLowerCase()
    ) {
      return false;
    }
    normalizePreflightAddress(request.to, "Permission request to address");
    validateErc7715PermissionRequestPayload(request, 0);
    return true;
  } catch {
    return false;
  }
}
