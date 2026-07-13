export const CONTENT_TO_INPAGE_MESSAGE_TYPES = new Set([
  "init",
  "setAddress",
  "dappAccountsResult",
  "setChainId",
  "accountsChanged",
  "sendTransactionResult",
  "signatureRequestResult",
  "watchAssetResult",
  "rpcResponse",
  "walletGetCapabilitiesResult",
  "walletSendCallsResult",
  "walletGetCallsStatusResult",
  "walletExecutionPermissionsResult",
]);

export function acceptedContentMessageType(event: MessageEvent): string | null {
  if (event.source !== window) return null;
  const type = event.data?.type;
  return typeof type === "string" && CONTENT_TO_INPAGE_MESSAGE_TYPES.has(type)
    ? type
    : null;
}
