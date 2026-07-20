import { makeProviderError } from "../errors";
import { announceProvider, setWindowEthereum } from "./announcement";
import { logProviderError } from "./consoleErrors";
import {
  pendingAccountCallbacks,
  pendingBatchCallbacks,
  pendingCallsStatusCallbacks,
  pendingCapabilitiesCallbacks,
  pendingExecutionPermissionCallbacks,
  pendingRpcCallbacks,
  pendingSignatureCallbacks,
  pendingTxCallbacks,
  pendingWatchAssetCallbacks,
} from "./pendingRequests";
import {
  ImpersonatorProvider,
  UNCONNECTED_PROVIDER_ADDRESS,
} from "./provider";
import {
  getProviderInstance,
  setProviderInstance,
} from "./providerRegistry";
import { acceptedContentMessageType } from "./resultPolicy";

function handleAccountResult(message: any): void {
  const callbacks = pendingAccountCallbacks.get(message.id);
  if (!callbacks) return;
  pendingAccountCallbacks.delete(message.id);
  if (message.success) {
    const accounts = Array.isArray(message.accounts)
      ? message.accounts.filter(
          (value: unknown): value is string => typeof value === "string",
        )
      : [];
    getProviderInstance()?.setAddress(
      accounts[0] ?? UNCONNECTED_PROVIDER_ADDRESS,
      false,
    );
    if (callbacks.method === "eth_requestAccounts" && accounts.length > 0) {
      getProviderInstance()?.emitConnected();
    }
    callbacks.resolve(accounts);
  } else {
    callbacks.reject(
      makeProviderError(
        message.error || "Account request failed",
        Number(message.code) || undefined,
      ),
    );
  }
}

function handleTransactionResult(message: any): void {
  const callbacks = pendingTxCallbacks.get(message.id);
  if (!callbacks) return;
  pendingTxCallbacks.delete(message.id);
  if (message.success && message.txHash) {
    callbacks.resolve(message.txHash);
    return;
  }
  const error = message.error || "Transaction failed";
  const lower = error.toLowerCase();
  const rejected =
    lower.includes("rejected by user") ||
    lower.includes("user rejected") ||
    lower.includes("user denied");
  const responseCode = Number(message.code);
  const code = Number.isFinite(responseCode)
    ? responseCode
    : rejected
      ? 4001
      : undefined;
  logProviderError("eth_sendTransaction", error, code);
  callbacks.reject(makeProviderError(error, code));
}

function handleSignatureResult(message: any): void {
  const callbacks = pendingSignatureCallbacks.get(message.id);
  if (!callbacks) return;
  pendingSignatureCallbacks.delete(message.id);
  if (message.success && message.signature) {
    callbacks.resolve(message.signature);
    return;
  }
  const error = message.error || "Signature request rejected";
  const lower = error.toLowerCase();
  const rejected =
    lower.includes("rejected") ||
    lower.includes("cancelled") ||
    lower.includes("denied");
  const schemaError = error.includes("EIP-712 schema");
  const responseCode = Number(message.code);
  const code = Number.isFinite(responseCode)
    ? responseCode
    : rejected
      ? 4001
      : schemaError
        ? -32603
        : undefined;
  logProviderError("signature request", error, code);
  callbacks.reject(makeProviderError(error, code));
}

function handleSimpleResult(
  callbacks: Map<string, { resolve(value: any): void; reject(error: Error): void }>,
  message: any,
  method: string,
  fallback: string,
  preserveCode = false,
): void {
  const pending = callbacks.get(message.id);
  if (!pending) return;
  callbacks.delete(message.id);
  if (message.success) pending.resolve(message.result);
  else {
    const error = message.error || fallback;
    const code = preserveCode ? message.code : undefined;
    logProviderError(method, error, code);
    pending.reject(makeProviderError(error, code));
  }
}

export function installContentResultRouter(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    const type = acceptedContentMessageType(event);
    if (!type) return;
    const message = event.data.msg;
    switch (type) {
      case "init": {
        try {
          const provider = new ImpersonatorProvider(
            message.chainId as number,
            message.address as string,
          );
          setProviderInstance(provider);
          setWindowEthereum(provider);
          announceProvider();
        } catch (error) {
          console.error("Impersonator Error:", error);
        }
        break;
      }
      case "setAddress":
        getProviderInstance()?.setAddress(
          message.address as string,
          message.emitAccountsChanged !== false,
        );
        break;
      case "dappAccountsResult":
        handleAccountResult(message);
        break;
      case "setChainId":
        getProviderInstance()?.setChainId(message.chainId as number);
        break;
      case "accountsChanged": {
        const provider = getProviderInstance();
        if (!provider) break;
        const accounts = Array.isArray(message.accounts)
          ? message.accounts
          : message.address
            ? [message.address]
            : [];
        if (accounts.length === 0) {
          provider.setAddress(UNCONNECTED_PROVIDER_ADDRESS, false);
        } else if (typeof accounts[0] === "string") {
          provider.setAddress(accounts[0], false);
        }
        provider.emit("accountsChanged", accounts);
        break;
      }
      case "sendTransactionResult":
        handleTransactionResult(message);
        break;
      case "signatureRequestResult":
        handleSignatureResult(message);
        break;
      case "watchAssetResult": {
        const callbacks = pendingWatchAssetCallbacks.get(message.id);
        if (!callbacks) break;
        pendingWatchAssetCallbacks.delete(message.id);
        if (message.success) callbacks.resolve(true);
        else {
          callbacks.reject(
            makeProviderError(
              message.error || "User rejected token addition",
              4001,
            ),
          );
        }
        break;
      }
      case "rpcResponse": {
        const callbacks = pendingRpcCallbacks.get(message.id);
        if (!callbacks) break;
        pendingRpcCallbacks.delete(message.id);
        if (message.error) {
          logProviderError("RPC request", message.error);
          callbacks.reject(makeProviderError(message.error));
        } else callbacks.resolve(message.result);
        break;
      }
      case "walletGetCapabilitiesResult":
        handleSimpleResult(
          pendingCapabilitiesCallbacks,
          message,
          "wallet_getCapabilities",
          "Failed to get capabilities",
        );
        break;
      case "walletSendCallsResult": {
        const callbacks = pendingBatchCallbacks.get(message.id);
        if (!callbacks) break;
        pendingBatchCallbacks.delete(message.id);
        if (message.success) callbacks.resolve(message.result);
        else {
          const error = message.error || "wallet_sendCalls failed";
          logProviderError("wallet_sendCalls", error, message.code, callbacks.params);
          callbacks.reject(makeProviderError(error, message.code));
        }
        break;
      }
      case "walletGetCallsStatusResult":
        handleSimpleResult(
          pendingCallsStatusCallbacks,
          message,
          "wallet_getCallsStatus",
          "Failed to get calls status",
          true,
        );
        break;
      case "walletExecutionPermissionsResult": {
        const callbacks = pendingExecutionPermissionCallbacks.get(message.id);
        if (!callbacks) break;
        pendingExecutionPermissionCallbacks.delete(message.id);
        if (message.success) callbacks.resolve(message.result);
        else {
          const error = message.error || `${callbacks.method} failed`;
          logProviderError(callbacks.method, error, message.code);
          callbacks.reject(makeProviderError(error, message.code));
        }
        break;
      }
    }
  });
}
