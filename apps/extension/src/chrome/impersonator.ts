import { EventEmitter } from "events";
import { hexValue } from "@ethersproject/bytes";
import { Logger } from "@ethersproject/logger";

const logger = new Logger("ethers/5.7.0");

type Window = Record<string, any>;

// EIP-6963 interfaces
interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: ImpersonatorProvider;
}

interface EIP6963AnnounceProviderEvent extends CustomEvent {
  type: "eip6963:announceProvider";
  detail: EIP6963ProviderDetail;
}

import { makeProviderError } from "./providerErrors";
import { WALLET_ICON } from "./walletIcon";

// Session UUID for EIP-6963 (generated once per page load)
const SESSION_UUID = crypto.randomUUID();

/**
 * Surface non-user-rejection wallet errors in the dapp's devtools console.
 * Without this, wagmi / viem capture rejections into their hook state and
 * dapps that only render a generic "Transaction failed" string (like
 * 7702beat) leave users with no clue what actually went wrong. User
 * rejections (code 4001) are skipped — those are expected churn and would
 * just spam the console.
 *
 * `details` is an optional payload (e.g. the request `params`) attached to
 * the log as a second argument so it shows up expandable in devtools.
 * Helpful when the error message references an indexed item ("Call 1
 * targets…") and the user needs to see what was actually in that slot.
 */
function logProviderError(
  method: string,
  message: string | undefined | null,
  code?: number,
  details?: unknown,
): void {
  if (code === 4001) return;
  const suffix = code !== undefined ? ` (code: ${code})` : "";
  const header = `[WalletChan] ${method} failed: ${message ?? "Unknown error"}${suffix}`;
  if (details !== undefined) {
    console.warn(header, details);
  } else {
    console.warn(header);
  }
}

// Pending transaction callbacks
const pendingTxCallbacks = new Map<
  string,
  { resolve: (hash: string) => void; reject: (error: Error) => void }
>();

// Pending signature request callbacks
const pendingSignatureCallbacks = new Map<
  string,
  { resolve: (result: string) => void; reject: (error: Error) => void }
>();

// Pending RPC request callbacks
const pendingRpcCallbacks = new Map<
  string,
  { resolve: (result: any) => void; reject: (error: Error) => void }
>();

// Pending wallet_watchAsset callbacks
const pendingWatchAssetCallbacks = new Map<
  string,
  { resolve: (result: boolean) => void; reject: (error: Error) => void }
>();

// Pending ERC-5792 batch call callbacks
const pendingBatchCallbacks = new Map<
  string,
  {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    /**
     * The original `wallet_sendCalls` params (sendCallsParams[0]). Stored
     * here so the rejection handler can attach them to the console log —
     * error messages like "Call 1 targets the zero address" are useless
     * without the caller seeing the actual call array.
     */
    params: unknown;
  }
>();

// Pending ERC-5792 capabilities callbacks
const pendingCapabilitiesCallbacks = new Map<
  string,
  { resolve: (result: any) => void; reject: (error: Error) => void }
>();

// Pending ERC-5792 getCallsStatus callbacks
const pendingCallsStatusCallbacks = new Map<
  string,
  { resolve: (result: any) => void; reject: (error: Error) => void }
>();

// Helper to make RPC calls through content script (to bypass page CSP)
function rpcCall(rpcUrl: string, method: string, params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    pendingRpcCallbacks.set(requestId, { resolve, reject });

    window.postMessage(
      {
        type: "i_rpcRequest",
        msg: {
          id: requestId,
          rpcUrl,
          method,
          params,
        },
      },
      "*",
    );

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRpcCallbacks.has(requestId)) {
        pendingRpcCallbacks.delete(requestId);
        reject(makeProviderError("RPC request timeout"));
      }
    }, 30000);
  });
}

class ImpersonatorProvider extends EventEmitter {
  isImpersonator = true;
  isMetaMask = true;

  private address: string;
  private rpcUrl: string;
  private chainId: number;

  constructor(chainId: number, rpcUrl: string, address: string) {
    super();

    this.rpcUrl = rpcUrl;
    this.chainId = chainId;
    this.address = address;
  }

  setAddress = (address: string) => {
    this.address = address;
    this.emit("accountsChanged", [address]);
  };

  setChainId = (chainId: number, rpcUrl: string) => {
    this.rpcUrl = rpcUrl;

    if (this.chainId !== chainId) {
      this.chainId = chainId;
      this.emit("chainChanged", hexValue(chainId));
    }
  };

  // Helper to make RPC calls through the proxy
  private async rpc(method: string, params: any[] = []): Promise<any> {
    return rpcCall(this.rpcUrl, method, params);
  }

  request(request: { method: string; params?: Array<any> }): Promise<any> {
    return this.send(request.method, request.params || []);
  }

  async send(method: string, params?: Array<any>): Promise<any> {
    const throwUnsupported = (message: string): never => {
      return logger.throwError(message, Logger.errors.UNSUPPORTED_OPERATION, {
        method: method,
        params: params,
      });
    };

    let coerce = (value: any) => value;

    switch (method) {
      // modified methods
      case "eth_requestAccounts": {
        const accounts = [this.address];
        // EIP-1193: Emit "connect" event when dapp connects
        this.emit("connect", { chainId: hexValue(this.chainId) });
        return accounts;
      }
      case "eth_accounts":
        return [this.address];

      case "net_version": {
        return this.chainId;
      }
      case "eth_chainId": {
        return hexValue(this.chainId);
      }
      case "wallet_addEthereumChain": {
        // @ts-ignore
        const addParams = params[0];
        const addChainId = Number(addParams.chainId as string);
        const self_add = this;

        const addChainPromise = new Promise<null>((resolve, reject) => {
          // Forward full params to content script for add-or-switch logic
          window.postMessage(
            {
              type: "i_addEthereumChain",
              msg: {
                chainId: addChainId,
                chainName: addParams.chainName,
                nativeCurrency: addParams.nativeCurrency,
                rpcUrls: addParams.rpcUrls,
                blockExplorerUrls: addParams.blockExplorerUrls,
              },
            },
            "*",
          );

          const controller = new AbortController();
          window.addEventListener(
            "message",
            (e: any) => {
              if (e.source !== window || !e.data.type) return;

              if (e.data.type === "addEthereumChainResult") {
                const msg = e.data.msg;
                controller.abort();
                if (msg.success) {
                  self_add.setChainId(msg.chainId, msg.rpcUrl);
                  resolve(null);
                } else {
                  reject(makeProviderError(msg.error || `Failed to add chain ${addChainId}`));
                }
              }
            },
            { signal: controller.signal } as AddEventListenerOptions,
          );
        });

        await addChainPromise;
        return null;
      }
      case "wallet_switchEthereumChain": {
        // @ts-ignore
        const chainId = Number(params[0].chainId as string);

        // Capture reference to this provider instance for use in event listener
        const self = this;

        const setChainIdPromise = new Promise<null>((resolve, reject) => {
          // send message to content_script (inject.ts) to fetch corresponding RPC
          window.postMessage(
            {
              type: "i_switchEthereumChain",
              msg: {
                chainId,
              },
            },
            "*",
          );

          // receive from content_script (inject.ts)
          const controller = new AbortController();
          window.addEventListener(
            "message",
            (e: any) => {
              // only accept messages from us
              if (e.source !== window) {
                return;
              }

              if (!e.data.type) {
                return;
              }

              switch (e.data.type) {
                case "switchEthereumChain": {
                  const chainId = e.data.msg.chainId as number;
                  const rpcUrl = e.data.msg.rpcUrl as string;
                  // Use the captured reference instead of window.ethereum
                  // to avoid issues with other wallets claiming window.ethereum
                  self.setChainId(chainId, rpcUrl);
                  // remove this listener as we already have a listener for "message" and don't want duplicates
                  controller.abort();

                  resolve(null);
                  break;
                }
                case "switchEthereumChainError": {
                  const errorChainId = e.data.msg.chainId as number;
                  // Only handle error for this specific chain switch request
                  if (errorChainId === chainId) {
                    controller.abort();
                    reject(
                      makeProviderError(
                        e.data.msg.error || `Chain ${chainId} is not supported`,
                      ),
                    );
                  }
                  break;
                }
              }
            },
            { signal: controller.signal } as AddEventListenerOptions,
          );
        });

        await setChainIdPromise;
        return null;
      }
      case "eth_sign":
      case "personal_sign":
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4": {
        const sigId = crypto.randomUUID();

        return new Promise<string>((resolve, reject) => {
          // Store callbacks for this signature request
          pendingSignatureCallbacks.set(sigId, { resolve, reject });

          // Send signature request to content script
          window.postMessage(
            {
              type: "i_signatureRequest",
              msg: {
                id: sigId,
                method: method,
                params: params || [],
                chainId: this.chainId,
              },
            },
            "*",
          );
        });
      }
      case "wallet_watchAsset": {
        // EIP-747: params can be { type, options } or [type, options]
        let assetType: string;
        let assetOptions: { address: string; symbol: string; decimals: number; image?: string };
        if (Array.isArray(params) && typeof params[0] === "string") {
          assetType = params[0];
          assetOptions = params[1];
        } else {
          // @ts-ignore
          const p = params as { type: string; options: any };
          assetType = p.type;
          assetOptions = p.options;
        }

        if (assetType !== "ERC20") {
          throw makeProviderError("Only ERC20 tokens are supported");
        }

        const watchId = crypto.randomUUID();
        return new Promise<boolean>((resolve, reject) => {
          pendingWatchAssetCallbacks.set(watchId, { resolve, reject });
          window.postMessage(
            {
              type: "i_watchAsset",
              msg: {
                id: watchId,
                asset: assetOptions,
                chainId: this.chainId,
              },
            },
            "*",
          );
        });
      }
      // ── ERC-5792 Batch Transaction Methods ──────────────────────────────
      case "wallet_getCapabilities": {
        const capId = crypto.randomUUID();
        const address = params?.[0] || this.address;
        const chainIds = params?.[1]; // optional chain ID filter

        return new Promise<any>((resolve, reject) => {
          pendingCapabilitiesCallbacks.set(capId, { resolve, reject });

          window.postMessage(
            {
              type: "i_walletGetCapabilities",
              msg: { id: capId, address, chainIds },
            },
            "*",
          );

          setTimeout(() => {
            if (pendingCapabilitiesCallbacks.has(capId)) {
              pendingCapabilitiesCallbacks.delete(capId);
              reject(makeProviderError("wallet_getCapabilities timeout"));
            }
          }, 15000);
        });
      }

      case "wallet_sendCalls": {
        const sendCallsId = crypto.randomUUID();
        // @ts-ignore
        const sendCallsParams = params?.[0] || params;

        return new Promise<any>((resolve, reject) => {
          pendingBatchCallbacks.set(sendCallsId, {
            resolve,
            reject,
            params: sendCallsParams,
          });

          window.postMessage(
            {
              type: "i_walletSendCalls",
              msg: { id: sendCallsId, params: sendCallsParams },
            },
            "*",
          );

          // 5-minute timeout (user needs time to review batch)
          setTimeout(() => {
            if (pendingBatchCallbacks.has(sendCallsId)) {
              pendingBatchCallbacks.delete(sendCallsId);
              reject(makeProviderError("wallet_sendCalls timeout"));
            }
          }, 5 * 60 * 1000);
        });
      }

      case "wallet_getCallsStatus": {
        const statusId = crypto.randomUUID();
        // @ts-ignore
        const bundleId = params?.[0];

        if (!bundleId) {
          return Promise.reject(makeProviderError("Missing bundle ID"));
        }

        return new Promise<any>((resolve, reject) => {
          pendingCallsStatusCallbacks.set(statusId, { resolve, reject });

          window.postMessage(
            {
              type: "i_walletGetCallsStatus",
              msg: { id: statusId, bundleId },
            },
            "*",
          );

          setTimeout(() => {
            if (pendingCallsStatusCallbacks.has(statusId)) {
              pendingCallsStatusCallbacks.delete(statusId);
              reject(makeProviderError("wallet_getCallsStatus timeout"));
            }
          }, 15000);
        });
      }

      case "wallet_showCallsStatus": {
        // @ts-ignore
        const showBundleId = params?.[0];
        if (showBundleId) {
          window.postMessage(
            {
              type: "i_walletShowCallsStatus",
              msg: { bundleId: showBundleId },
            },
            "*",
          );
        }
        return Promise.resolve();
      }

      case "eth_sendTransaction": {
        // Chain validation happens in txHandlers.ts (background script)
        // which has access to chrome.storage for custom chains

        // @ts-ignore
        const txParams = params[0] as {
          to?: string;
          data?: string;
          value?: string;
          gas?: string;
          gasPrice?: string;
          maxFeePerGas?: string;
          maxPriorityFeePerGas?: string;
        };

        const txId = crypto.randomUUID();

        return new Promise<string>((resolve, reject) => {
          // Store callbacks for this transaction
          pendingTxCallbacks.set(txId, { resolve, reject });

          // Send transaction request to content script
          window.postMessage(
            {
              type: "i_sendTransaction",
              msg: {
                id: txId,
                from: this.address,
                to: txParams.to || null,
                data: txParams.data || "0x",
                value: txParams.value || "0x0",
                chainId: this.chainId,
                ...(txParams.gas ? { gas: txParams.gas } : {}),
                ...(txParams.gasPrice ? { gasPrice: txParams.gasPrice } : {}),
                ...(txParams.maxFeePerGas
                  ? { maxFeePerGas: txParams.maxFeePerGas }
                  : {}),
                ...(txParams.maxPriorityFeePerGas
                  ? { maxPriorityFeePerGas: txParams.maxPriorityFeePerGas }
                  : {}),
              },
            },
            "*",
          );
        });
      }
      // RPC methods - proxied through content script to bypass CSP
      case "eth_gasPrice":
      case "eth_blockNumber":
      case "eth_getBalance":
      case "eth_getStorageAt":
      case "eth_getTransactionCount":
      case "eth_getBlockTransactionCountByHash":
      case "eth_getBlockTransactionCountByNumber":
      case "eth_getCode":
      case "eth_sendRawTransaction":
      case "eth_call":
      case "eth_estimateGas":
      case "estimateGas":
      case "eth_getBlockByHash":
      case "eth_getBlockByNumber":
      case "eth_getTransactionByHash":
      case "eth_getTransactionReceipt":
      case "eth_getUncleCountByBlockHash":
      case "eth_getUncleCountByBlockNumber":
      case "eth_getTransactionByBlockHashAndIndex":
      case "eth_getTransactionByBlockNumberAndIndex":
      case "eth_getUncleByBlockHashAndIndex":
      case "eth_getUncleByBlockNumberAndIndex":
      case "eth_newFilter":
      case "eth_newBlockFilter":
      case "eth_newPendingTransactionFilter":
      case "eth_uninstallFilter":
      case "eth_getFilterChanges":
      case "eth_getFilterLogs":
      case "eth_getLogs":
      case "eth_feeHistory":
      case "eth_maxPriorityFeePerGas": {
        // Forward all RPC calls through the proxy
        return await this.rpc(method, params || []);
      }
    }

    // Default: forward to RPC
    return await this.rpc(method, params || []);
  }
}

// Store the provider instance for EIP-6963 announcements
let providerInstance: ImpersonatorProvider | null = null;

// EIP-6963 provider info
const providerInfo: EIP6963ProviderInfo = {
  uuid: SESSION_UUID,
  name: "WalletChan",
  icon: WALLET_ICON,
  rdns: "com.walletchan",
};

// Announce provider via EIP-6963
function announceProvider() {
  if (!providerInstance) return;

  const detail: EIP6963ProviderDetail = Object.freeze({
    info: Object.freeze({ ...providerInfo }),
    provider: providerInstance,
  });

  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail,
    }) as EIP6963AnnounceProviderEvent,
  );
}

// Safely set window.ethereum, handling conflicts with other wallets like Rabby
// that aggressively claim the property with getter-only descriptors
function setWindowEthereum(provider: ImpersonatorProvider): boolean {
  try {
    // First, try to delete any existing property to clear getter-only descriptors
    try {
      delete (window as any).ethereum;
    } catch {
      // Ignore - property might not be configurable
    }

    // Try direct assignment first (works if property doesn't exist or has setter)
    try {
      (window as Window).ethereum = provider;
      if ((window as Window).ethereum === provider) {
        return true;
      }
    } catch {
      // Direct assignment failed, try Object.defineProperty
    }

    // Use Object.defineProperty with configurable: true so other wallets can still override if needed
    Object.defineProperty(window, "ethereum", {
      value: provider,
      writable: true,
      configurable: true,
      enumerable: true,
    });

    return (window as Window).ethereum === provider;
  } catch (e) {
    console.warn(
      "WalletChan: Could not set window.ethereum (another wallet may have claimed it).",
      "Dapps supporting EIP-6963 will still be able to discover WalletChan.",
    );
    return false;
  }
}

// Listen for EIP-6963 provider requests from dapps
window.addEventListener("eip6963:requestProvider", () => {
  announceProvider();
});

// receive from content_script (inject.ts)
window.addEventListener("message", (e: any) => {
  // only accept messages from us
  if (e.source !== window) {
    return;
  }

  if (!e.data.type) {
    return;
  }

  switch (e.data.type) {
    case "init": {
      const address = e.data.msg.address as string;
      const chainId = e.data.msg.chainId as number;
      const rpcUrl = e.data.msg.rpcUrl as string;
      try {
        const impersonatedProvider = new ImpersonatorProvider(
          chainId,
          rpcUrl,
          address,
        );

        // Store for EIP-6963 announcements
        providerInstance = impersonatedProvider;

        // Legacy: Set window.ethereum for backward compatibility
        // Uses Object.defineProperty to handle conflicts with other wallets like Rabby
        setWindowEthereum(impersonatedProvider);

        // EIP-6963: Announce provider to dapps (works even if window.ethereum couldn't be set)
        announceProvider();
      } catch (e) {
        console.error("Impersonator Error:", e);
      }

      break;
    }
    case "setAddress": {
      const address = e.data.msg.address as string;
      // Use providerInstance directly instead of window.ethereum
      // to avoid issues with other wallets claiming window.ethereum
      if (providerInstance) {
        providerInstance.setAddress(address);
      }
      break;
    }
    case "setChainId": {
      const chainId = e.data.msg.chainId as number;
      const rpcUrl = e.data.msg.rpcUrl as string;
      // Use providerInstance directly instead of window.ethereum
      if (providerInstance) {
        providerInstance.setChainId(chainId, rpcUrl);
      }
      break;
    }
    case "sendTransactionResult": {
      const txId = e.data.msg.id as string;
      const callbacks = pendingTxCallbacks.get(txId);
      if (callbacks) {
        pendingTxCallbacks.delete(txId);
        if (e.data.msg.success && e.data.msg.txHash) {
          callbacks.resolve(e.data.msg.txHash);
        } else {
          const errorMessage = e.data.msg.error || "Transaction failed";
          // Check if this is a user rejection (EIP-1193 error code 4001)
          const isUserRejection =
            errorMessage.toLowerCase().includes("rejected by user") ||
            errorMessage.toLowerCase().includes("user rejected") ||
            errorMessage.toLowerCase().includes("user denied");
          const code = isUserRejection ? 4001 : undefined;
          logProviderError("eth_sendTransaction", errorMessage, code);
          callbacks.reject(makeProviderError(errorMessage, code));
        }
      }
      break;
    }
    case "signatureRequestResult": {
      const sigId = e.data.msg.id as string;
      const callbacks = pendingSignatureCallbacks.get(sigId);
      if (callbacks) {
        pendingSignatureCallbacks.delete(sigId);
        if (e.data.msg.success && e.data.msg.signature) {
          callbacks.resolve(e.data.msg.signature);
        } else {
          const errorMessage = e.data.msg.error || "Signature request rejected";

          // Check if this is a user rejection (EIP-1193 error code 4001)
          const isUserRejection =
            errorMessage.toLowerCase().includes("rejected") ||
            errorMessage.toLowerCase().includes("cancelled") ||
            errorMessage.toLowerCase().includes("denied");

          // Check if this is an EIP-712 schema validation error (JSON-RPC error code -32603)
          const isSchemaError = errorMessage.includes("EIP-712 schema");

          const code = isUserRejection ? 4001 : isSchemaError ? -32603 : undefined;
          logProviderError("signature request", errorMessage, code);
          callbacks.reject(makeProviderError(errorMessage, code));
        }
      }
      break;
    }
    case "watchAssetResult": {
      const watchId = e.data.msg.id as string;
      const callbacks = pendingWatchAssetCallbacks.get(watchId);
      if (callbacks) {
        pendingWatchAssetCallbacks.delete(watchId);
        if (e.data.msg.success) {
          callbacks.resolve(true);
        } else {
          // watchAsset failures are always user rejections in our impl
          // (the popup either confirms or the user closes it) — code 4001
          // suppresses the log.
          callbacks.reject(
            makeProviderError(e.data.msg.error || "User rejected token addition", 4001),
          );
        }
      }
      break;
    }
    case "rpcResponse": {
      const requestId = e.data.msg.id as string;
      const callbacks = pendingRpcCallbacks.get(requestId);
      if (callbacks) {
        pendingRpcCallbacks.delete(requestId);
        if (e.data.msg.error) {
          logProviderError("RPC request", e.data.msg.error);
          callbacks.reject(makeProviderError(e.data.msg.error));
        } else {
          callbacks.resolve(e.data.msg.result);
        }
      }
      break;
    }
    // ── ERC-5792 results ──────────────────────────────────────────────────
    case "walletGetCapabilitiesResult": {
      const capId = e.data.msg.id as string;
      const callbacks = pendingCapabilitiesCallbacks.get(capId);
      if (callbacks) {
        pendingCapabilitiesCallbacks.delete(capId);
        if (e.data.msg.success) {
          callbacks.resolve(e.data.msg.result);
        } else {
          const errorMessage = e.data.msg.error || "Failed to get capabilities";
          logProviderError("wallet_getCapabilities", errorMessage);
          callbacks.reject(makeProviderError(errorMessage));
        }
      }
      break;
    }
    case "walletSendCallsResult": {
      const batchId = e.data.msg.id as string;
      const callbacks = pendingBatchCallbacks.get(batchId);
      if (callbacks) {
        pendingBatchCallbacks.delete(batchId);
        if (e.data.msg.success) {
          callbacks.resolve(e.data.msg.result);
        } else {
          const errorMessage = e.data.msg.error || "wallet_sendCalls failed";
          logProviderError(
            "wallet_sendCalls",
            errorMessage,
            e.data.msg.code,
            callbacks.params,
          );
          callbacks.reject(makeProviderError(errorMessage, e.data.msg.code));
        }
      }
      break;
    }
    case "walletGetCallsStatusResult": {
      const statusId = e.data.msg.id as string;
      const callbacks = pendingCallsStatusCallbacks.get(statusId);
      if (callbacks) {
        pendingCallsStatusCallbacks.delete(statusId);
        if (e.data.msg.success) {
          callbacks.resolve(e.data.msg.result);
        } else {
          const errorMessage = e.data.msg.error || "Failed to get calls status";
          logProviderError("wallet_getCallsStatus", errorMessage, e.data.msg.code);
          callbacks.reject(makeProviderError(errorMessage, e.data.msg.code));
        }
      }
      break;
    }
  }
});
