/**
 * Pure mapping for how a rejected provider request reaches the injected
 * provider. The executor is deliberately separate so every result-storage key
 * and payload can be audited without loading Chrome or transaction modules.
 */

export type ProviderRequestRejectionDelivery =
  | {
      kind: "storage";
      key: string;
      result: Record<string, unknown>;
    }
  | {
      kind: "direct-response";
      response: Record<string, unknown>;
    }
  | { kind: "handled-no-response" }
  | { kind: "unhandled" };

type ProviderRequestLike = Record<string, unknown>;

function storageDelivery(
  requestId: unknown,
  prefix: string,
  result: Record<string, unknown>,
): ProviderRequestRejectionDelivery {
  return typeof requestId === "string"
    ? { kind: "storage", key: `${prefix}:${requestId}`, result }
    : { kind: "handled-no-response" };
}

export function mapProviderRequestRejection(
  message: unknown,
  error: string,
  code: number,
): ProviderRequestRejectionDelivery {
  if (!message || typeof message !== "object") return { kind: "unhandled" };
  const request = message as ProviderRequestLike;
  const failure = { success: false, error, code };

  switch (request.type) {
    case "sendTransaction":
      return storageDelivery(request.txId, "txResult", failure);
    case "signatureRequest":
      return storageDelivery(request.sigId, "sigResult", failure);
    case "walletSendCalls":
      return storageDelivery(request.bundleId, "batchTxAck", failure);
    case "walletGetCapabilities":
      return storageDelivery(
        request.requestId,
        "capabilitiesResult",
        failure,
      );
    case "walletGetCallsStatus":
      return storageDelivery(request.requestId, "callsStatusResult", failure);
    case "watchAsset":
      return storageDelivery(request.watchAssetId, "watchAssetResult", failure);
    case "addEthereumChain":
      return storageDelivery(request.requestId, "addChainResult", failure);
    case "rpcRequest":
      return storageDelivery(request.rpcId, "rpcResult", { error, code });
    case "requestDappConnection":
      return storageDelivery(
        request.requestId,
        "dappConnectionResult",
        failure,
      );
    case "walletExecutionPermissions":
      return { kind: "direct-response", response: failure };
    case "walletShowCallsStatus":
    case "dappChainSwitchNotification":
      return { kind: "handled-no-response" };
    default:
      return { kind: "unhandled" };
  }
}

export function deliverProviderRequestRejection(
  delivery: ProviderRequestRejectionDelivery,
  ports: {
    writeResult: (key: string, result: Record<string, unknown>) => Promise<void>;
    sendResponse: (response?: unknown) => void;
  },
): boolean {
  switch (delivery.kind) {
    case "storage":
      void ports.writeResult(delivery.key, delivery.result);
      return true;
    case "direct-response":
      ports.sendResponse(delivery.response);
      return true;
    case "handled-no-response":
      return true;
    case "unhandled":
      return false;
  }
}
