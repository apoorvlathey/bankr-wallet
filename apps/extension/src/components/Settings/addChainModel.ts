import type { NetworksInfo } from "@/types";

export function getChainIdConflict(
  networksInfo: NetworksInfo | undefined,
  chainIdInput: string,
  allowedExistingChainId?: number,
): string {
  if (!chainIdInput || !networksInfo) return "";
  const chainId = Number.parseInt(chainIdInput, 10);
  const existing = Object.entries(networksInfo).find(
    ([, network]) => network.chainId === chainId,
  );
  if (!existing || chainId === allowedExistingChainId) return "";
  return `Chain ID ${chainId} already exists as "${existing[0]}". You can edit its RPC in the chain list.`;
}

export function hasChainNameConflict(
  networksInfo: NetworksInfo | undefined,
  chainName: string,
  requestedChainId: number,
  allowedExistingChainId?: number,
): boolean {
  const existing = networksInfo?.[chainName];
  if (!existing) return false;
  return !(
    requestedChainId === allowedExistingChainId &&
    existing.chainId === requestedChainId
  );
}
