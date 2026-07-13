import type { NetworksInfo } from "@/types";
import { sanitizeUntrustedImageUrl } from "@/lib/remoteImagePolicy";
import { resolveProviderActiveChainId } from "../chainBoundary";

export const UNCONNECTED_ADDRESS =
  "0x0000000000000000000000000000000000000000";

export interface ContentBridgeState {
  address: string;
  displayAddress: string;
  chainName: string;
  accountId: string;
  accountType: string;
}

export const bridgeState: ContentBridgeState = {
  address: "",
  displayAddress: "",
  chainName: "",
  accountId: "",
  accountType: "",
};

export function pageFaviconUrl(): string | null {
  const standard = document.querySelector(
    'link[rel="icon"], link[rel="shortcut icon"]',
  ) as HTMLLinkElement | null;
  if (standard?.href) return sanitizeUntrustedImageUrl(standard.href);

  const apple = document.querySelector(
    'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]',
  ) as HTMLLinkElement | null;
  if (apple?.href) return sanitizeUntrustedImageUrl(apple.href);
  return sanitizeUntrustedImageUrl(
    new URL("/favicon.ico", window.location.origin).href,
  );
}

export async function getAttestedProviderChainId(): Promise<number | null> {
  const { networksInfo } = (await chrome.storage.sync.get(
    "networksInfo",
  )) as { networksInfo?: NetworksInfo };
  return resolveProviderActiveChainId(bridgeState.chainName, networksInfo);
}

export function notifyDappChainSwitch(
  chainId: number,
  chainName: string,
): void {
  chrome.runtime
    .sendMessage({ type: "dappChainSwitchNotification", chainId, chainName })
    .catch(() => undefined);
}
