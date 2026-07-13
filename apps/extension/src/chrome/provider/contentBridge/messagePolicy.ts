export const PAGE_TO_CONTENT_MESSAGE_TYPES = new Set([
  "i_dappAccounts",
  "i_switchEthereumChain",
  "i_addEthereumChain",
  "i_sendTransaction",
  "i_signatureRequest",
  "i_watchAsset",
  "i_rpcRequest",
  "i_walletGetCapabilities",
  "i_walletSendCalls",
  "i_walletGetCallsStatus",
  "i_walletShowCallsStatus",
  "i_walletExecutionPermissions",
]);

export const RUNTIME_TO_PAGE_MESSAGE_TYPES = new Set([
  "setAddress",
  "setChainId",
  "setAccount",
  "getInfo",
  "dappPermissionRevoked",
]);

export function acceptedPageMessageType(event: MessageEvent): string | null {
  if (event.source !== window) return null;
  const type = event.data?.type;
  return typeof type === "string" && PAGE_TO_CONTENT_MESSAGE_TYPES.has(type)
    ? type
    : null;
}

export function acceptedRuntimeMessageType(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const type = (message as { type?: unknown }).type;
  return typeof type === "string" && RUNTIME_TO_PAGE_MESSAGE_TYPES.has(type)
    ? type
    : null;
}
