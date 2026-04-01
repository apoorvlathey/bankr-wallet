import { NetworksInfo } from "../types";
import { getResolvedChainById } from "@/lib/chains";

/**
 * Get the favicon URL from the current page
 */
function getFaviconUrl(): string | null {
  // Try standard favicon link elements
  const standardFavicon = document.querySelector(
    'link[rel="icon"], link[rel="shortcut icon"]'
  ) as HTMLLinkElement | null;
  if (standardFavicon?.href) {
    return standardFavicon.href;
  }

  // Try Apple touch icon (usually higher quality)
  const appleTouchIcon = document.querySelector(
    'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
  ) as HTMLLinkElement | null;
  if (appleTouchIcon?.href) {
    return appleTouchIcon.href;
  }

  // Fallback to default /favicon.ico
  return new URL("/favicon.ico", window.location.origin).href;
}

/**
 * Wait for a result to appear in chrome.storage.local under the given key.
 * Used to receive transaction/signature results from the background script
 * without keeping a long-lived message channel open (which is fragile in MV3).
 */
function waitForStorageResult<T>(key: string, timeoutMs = 5 * 60 * 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.storage.onChanged.removeListener(listener);
      reject(new Error("Request timed out"));
    }, timeoutMs);

    // Check if result already exists (race: result written before listener attached)
    chrome.storage.local.get(key).then((items) => {
      if (items[key]?.result) {
        clearTimeout(timeout);
        chrome.storage.onChanged.removeListener(listener);
        chrome.storage.local.remove(key);
        resolve(items[key].result as T);
      }
    });

    function listener(
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) {
      if (areaName !== "local" || !changes[key]?.newValue?.result) return;
      clearTimeout(timeout);
      chrome.storage.onChanged.removeListener(listener);
      chrome.storage.local.remove(key);
      resolve(changes[key].newValue.result as T);
    }

    chrome.storage.onChanged.addListener(listener);
  });
}

let store = {
  address: "",
  displayAddress: "",
  chainName: "",
  accountId: "",      // Current account ID
  accountType: "",    // "bankr" | "privateKey"
};

const init = async () => {
  // inject inpage.js into webpage
  try {
    let script = document.createElement("script");
    script.setAttribute("type", "text/javascript");
    script.src = chrome.runtime.getURL("/static/js/inpage.js");
    script.onload = async function () {
      // @ts-ignore
      this.remove();

      // initialize web3 provider (window.ethereum)
      const { address } = (await chrome.storage.sync.get("address")) as {
        address: string | undefined;
      };
      const { displayAddress } = (await chrome.storage.sync.get(
        "displayAddress"
      )) as {
        displayAddress: string | undefined;
      };
      let { chainName } = (await chrome.storage.sync.get("chainName")) as {
        chainName: string | undefined;
      };
      const { networksInfo } = (await chrome.storage.sync.get(
        "networksInfo"
      )) as { networksInfo: NetworksInfo | undefined };

      if (
        networksInfo &&
        chainName &&
        networksInfo[chainName] &&
        address &&
        displayAddress
      ) {
        store = {
          address,
          displayAddress,
          chainName,
          accountId: "",
          accountType: "",
        };

        window.postMessage(
          {
            type: "init",
            msg: {
              address,
              chainId: networksInfo[chainName].chainId,
              rpcUrl: networksInfo[chainName].rpcUrl,
            },
          },
          "*"
        );

        // Verify with background that we have the correct active account address
        // This ensures the address matches the active account even if storage was stale
        chrome.runtime.sendMessage({ type: "getActiveAccount" }, (account) => {
          if (chrome.runtime.lastError) {
            // Extension context invalidated, ignore
            return;
          }
          if (account && account.address && account.address.toLowerCase() !== address.toLowerCase()) {
            // Active account address differs from storage - update
            store.address = account.address;
            store.displayAddress = account.displayName || account.address;
            store.accountId = account.id;
            store.accountType = account.type;

            // Emit accountsChanged to sync dapp with correct address
            window.postMessage({
              type: "accountsChanged",
              msg: { address: account.address },
            }, "*");
          } else if (account) {
            // Address matches, just update account metadata
            store.accountId = account.id;
            store.accountType = account.type;
          }
        });
      }
    };
    document.head
      ? document.head.prepend(script)
      : document.documentElement.prepend(script);
  } catch (e) {
    console.log(e);
  }
};

// Receive messages from popup.js and forward it to the injected code (impersonator.ts)
chrome.runtime.onMessage.addListener((msgObj, sender, sendResponse) => {
  if (msgObj.type) {
    switch (msgObj.type) {
      case "setAddress": {
        const address = msgObj.msg.address as string;
        const displayAddress = msgObj.msg.displayAddress as string;

        // Only emit accountsChanged if address actually changed
        const addressChanged = store.address !== address;

        store.address = address;
        store.displayAddress = displayAddress;

        // Emit accountsChanged so dapps know the address updated
        if (addressChanged && address) {
          window.postMessage({
            type: "accountsChanged",
            msg: { address },
          }, "*");
        }

        // Forward to inpage script for provider state update
        window.postMessage(msgObj, "*");
        break;
      }
      case "setChainId": {
        const chainName = msgObj.msg.chainName as string;

        store.chainName = chainName;

        // Forward to inpage script for provider chain update
        window.postMessage(msgObj, "*");
        break;
      }
      case "setAccount": {
        // Handle account switch - update store and emit accountsChanged
        const address = msgObj.msg.address as string;
        const displayAddress = msgObj.msg.displayAddress as string;
        const accountId = msgObj.msg.accountId as string;
        const accountType = msgObj.msg.accountType as string;

        store.address = address;
        store.displayAddress = displayAddress;
        store.accountId = accountId;
        store.accountType = accountType;

        // Forward to inpage script to emit accountsChanged
        window.postMessage({
          type: "accountsChanged",
          msg: { address },
        }, "*");
        break;
      }
      case "getInfo": {
        sendResponse(store);

        break;
      }
      // All other message types (e.g., newPendingTxRequest, accountsUpdated,
      // txHistoryUpdated) are NOT forwarded to the webpage to prevent
      // malicious dapps from eavesdropping on wallet activity
    }
  }
});

// Receive messages from injected impersonator.ts code
window.addEventListener("message", async (e) => {
  // only accept messages from us
  if (e.source !== window) {
    return;
  }

  if (!e.data.type) {
    return;
  }

  switch (e.data.type) {
    case "i_switchEthereumChain": {
      const chainId = e.data.msg.chainId as number;
      const { networksInfo } = (await chrome.storage.sync.get(
        "networksInfo"
      )) as { networksInfo: NetworksInfo | undefined };

      if (!networksInfo) {
        // Send error back to impersonator
        window.postMessage(
          {
            type: "switchEthereumChainError",
            msg: {
              chainId,
              error: "Networks not configured",
            },
          },
          "*"
        );
        break;
      }

      let rpcUrl: string | undefined;
      let chainName: string | undefined;
      for (const _chainName of Object.keys(networksInfo)) {
        if (networksInfo[_chainName].chainId === chainId) {
          rpcUrl = networksInfo[_chainName].rpcUrl;
          chainName = _chainName;
          break;
        }
      }

      if (!rpcUrl || !chainName) {
        // Chain not supported - send error back to impersonator
        window.postMessage(
          {
            type: "switchEthereumChainError",
            msg: {
              chainId,
              error: `Chain ${chainId} is not supported`,
            },
          },
          "*"
        );
        break;
      }

      store.chainName = chainName;

      // Save chainName to storage so popup/sidepanel reflects the change
      await chrome.storage.sync.set({ chainName });

      // send message to switchEthereumChain with RPC, in impersonator.ts
      window.postMessage(
        {
          type: "switchEthereumChain",
          msg: {
            chainId,
            rpcUrl,
          },
        },
        "*"
      );
      break;
    }

    case "i_addEthereumChain": {
      const { chainId, chainName: reqChainName, nativeCurrency, rpcUrls, blockExplorerUrls } =
        e.data.msg as {
          chainId: number;
          chainName?: string;
          nativeCurrency?: { name: string; symbol: string; decimals: number };
          rpcUrls?: string[];
          blockExplorerUrls?: string[];
        };

      // Check if chain already exists in networksInfo
      const { networksInfo: nets } = (await chrome.storage.sync.get("networksInfo")) as {
        networksInfo: NetworksInfo | undefined;
      };

      if (nets) {
        for (const name of Object.keys(nets)) {
          if (nets[name].chainId === chainId) {
            const resolvedChain = getResolvedChainById(chainId, nets);
            const shouldSwitch =
              store.accountType !== "bankr" ||
              resolvedChain?.isBankrSupported === true;

            // Chain exists — add succeeds, but only switch if the active
            // account type supports the chain.
            if (shouldSwitch) {
              store.chainName = name;
              await chrome.storage.sync.set({ chainName: name });
            }
            window.postMessage(
              {
                type: "addEthereumChainResult",
                msg: { success: true, chainId, rpcUrl: nets[name].rpcUrl },
              },
              "*"
            );
            if (shouldSwitch) {
              // Also emit switchEthereumChain so provider updates chainId
              window.postMessage(
                {
                  type: "switchEthereumChain",
                  msg: { chainId, rpcUrl: nets[name].rpcUrl },
                },
                "*"
              );
            }
            break;
          }
        }
        // If we found it and already broke, don't continue
        const found = nets && Object.values(nets).some((n) => n.chainId === chainId);
        if (found) break;
      }

      // Chain doesn't exist — forward to background for user confirmation
      const addChainRequestId = crypto.randomUUID();

      waitForStorageResult<{ success: boolean; error?: string; rpcUrl?: string; chainName?: string; shouldSwitch?: boolean }>(
        `addChainResult:${addChainRequestId}`,
        5 * 60 * 1000
      )
        .then((result) => {
          if (result.success && result.rpcUrl && result.chainName) {
            if (result.shouldSwitch !== false) {
              store.chainName = result.chainName;
              chrome.storage.sync.set({ chainName: result.chainName }).catch(() => {});
            }
            window.postMessage(
              {
                type: "addEthereumChainResult",
                msg: { success: true, chainId, rpcUrl: result.rpcUrl },
              },
              "*"
            );
            if (result.shouldSwitch !== false) {
              window.postMessage(
                {
                  type: "switchEthereumChain",
                  msg: { chainId, rpcUrl: result.rpcUrl },
                },
                "*"
              );
            }
          } else {
            window.postMessage(
              {
                type: "addEthereumChainResult",
                msg: { success: false, error: result.error || "User rejected" },
              },
              "*"
            );
          }
        })
        .catch((err) => {
          window.postMessage(
            {
              type: "addEthereumChainResult",
              msg: { success: false, error: err.message },
            },
            "*"
          );
        });

      chrome.runtime.sendMessage({
        type: "addEthereumChain",
        requestId: addChainRequestId,
        chainId,
        chainName: reqChainName,
        nativeCurrency,
        rpcUrls,
        blockExplorerUrls,
        origin: window.location.origin,
        favicon: getFaviconUrl(),
      });
      break;
    }

    case "i_sendTransaction": {
      const { id, from, to, data, value, chainId, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas } = e.data.msg as {
        id: string;
        from: string;
        to: string | null;
        data: string;
        value: string;
        chainId: number;
        gas?: string;
        gasPrice?: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
      };

      // Generate txId here and watch storage — no sendMessage callback needed
      const txId = crypto.randomUUID();

      // Start watching for result BEFORE sending message (avoids race condition)
      waitForStorageResult<{ success: boolean; txHash?: string; error?: string }>(
        `txResult:${txId}`
      ).then((result) => {
        window.postMessage(
          { type: "sendTransactionResult", msg: { id, success: result.success, txHash: result.txHash, error: result.error } },
          "*"
        );
      }).catch((err) => {
        window.postMessage(
          { type: "sendTransactionResult", msg: { id, success: false, error: err.message } },
          "*"
        );
      });

      // Fire-and-forget message to background (no callback)
      chrome.runtime.sendMessage({
        type: "sendTransaction",
        txId,
        tx: {
          from, to, data, value, chainId,
          ...(gas ? { gas } : {}),
          ...(gasPrice ? { gasPrice } : {}),
          ...(maxFeePerGas ? { maxFeePerGas } : {}),
          ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
        },
        origin: window.location.origin,
        favicon: getFaviconUrl(),
      });
      break;
    }

    case "i_signatureRequest": {
      const { id, method, params, chainId } = e.data.msg as {
        id: string;
        method: string;
        params: any[];
        chainId: number;
      };

      // Generate sigId here and watch storage — no sendMessage callback needed
      const sigId = crypto.randomUUID();

      // Start watching for result BEFORE sending message (avoids race condition)
      waitForStorageResult<{ success: boolean; signature?: string; error?: string }>(
        `sigResult:${sigId}`
      ).then((result) => {
        window.postMessage(
          { type: "signatureRequestResult", msg: { id, success: result.success, signature: result.signature, error: result.error } },
          "*"
        );
      }).catch((err) => {
        window.postMessage(
          { type: "signatureRequestResult", msg: { id, success: false, error: err.message } },
          "*"
        );
      });

      // Fire-and-forget message to background (no callback)
      chrome.runtime.sendMessage({
        type: "signatureRequest",
        sigId,
        signature: { method, params, chainId },
        origin: window.location.origin,
        favicon: getFaviconUrl(),
      });
      break;
    }

    case "i_watchAsset": {
      const { id, asset, chainId } = e.data.msg as {
        id: string;
        asset: { address: string; symbol: string; decimals: number; image?: string };
        chainId: number;
      };

      const watchAssetId = crypto.randomUUID();

      waitForStorageResult<{ success: boolean; error?: string }>(
        `watchAssetResult:${watchAssetId}`,
        5 * 60 * 1000 // 5 minute timeout
      ).then((result) => {
        window.postMessage(
          { type: "watchAssetResult", msg: { id, success: result.success, error: result.error } },
          "*"
        );
      }).catch((err) => {
        window.postMessage(
          { type: "watchAssetResult", msg: { id, success: false, error: err.message } },
          "*"
        );
      });

      chrome.runtime.sendMessage({
        type: "watchAsset",
        watchAssetId,
        asset,
        chainId,
        origin: window.location.origin,
        favicon: getFaviconUrl(),
      });
      break;
    }

    case "i_rpcRequest": {
      const { id, rpcUrl, method, params } = e.data.msg as {
        id: string;
        rpcUrl: string;
        method: string;
        params: any[];
      };

      // Generate a content-script UUID for the storage key (don't use dapp-supplied id)
      const rpcId = crypto.randomUUID();

      waitForStorageResult<{ result?: any; error?: string }>(
        `rpcResult:${rpcId}`, 30 * 1000 // 30s timeout for RPC calls
      ).then((response) => {
        window.postMessage(
          { type: "rpcResponse", msg: { id, result: response.result, error: response.error } },
          "*"
        );
      }).catch((err) => {
        window.postMessage(
          { type: "rpcResponse", msg: { id, result: undefined, error: err.message } },
          "*"
        );
      });

      // Fire-and-forget message to background
      chrome.runtime.sendMessage({
        type: "rpcRequest",
        rpcId,
        rpcUrl,
        method,
        params,
      });
      break;
    }

    // ── ERC-5792 Batch Transaction Methods ──────────────────────────────────

    case "i_walletGetCapabilities": {
      const { id, address, chainIds } = e.data.msg as {
        id: string;
        address: string;
        chainIds?: string[];
      };

      const requestId = crypto.randomUUID();

      waitForStorageResult<any>(
        `capabilitiesResult:${requestId}`, 15 * 1000
      ).then((result) => {
        window.postMessage(
          { type: "walletGetCapabilitiesResult", msg: { id, success: true, result } },
          "*"
        );
      }).catch((err) => {
        window.postMessage(
          { type: "walletGetCapabilitiesResult", msg: { id, success: false, error: err.message } },
          "*"
        );
      });

      chrome.runtime.sendMessage({
        type: "walletGetCapabilities",
        requestId,
        address,
        chainIds,
      });
      break;
    }

    case "i_walletSendCalls": {
      const { id, params } = e.data.msg as {
        id: string;
        params: any;
      };

      // Generate bundle ID in content script (not dapp-controlled)
      const bundleId = crypto.randomUUID();

      // Wait for acknowledgment (immediate — background writes this after saving pending request)
      waitForStorageResult<{ success: boolean; id?: string; error?: string; code?: number }>(
        `batchTxAck:${bundleId}`, 15 * 1000
      ).then((result) => {
        if (result.success) {
          window.postMessage(
            { type: "walletSendCallsResult", msg: { id, success: true, result: { id: result.id } } },
            "*"
          );
        } else {
          window.postMessage(
            { type: "walletSendCallsResult", msg: { id, success: false, error: result.error, code: result.code } },
            "*"
          );
        }
      }).catch((err) => {
        window.postMessage(
          { type: "walletSendCallsResult", msg: { id, success: false, error: err.message } },
          "*"
        );
      });

      chrome.runtime.sendMessage({
        type: "walletSendCalls",
        bundleId,
        params,
        origin: window.location.origin,
        favicon: getFaviconUrl(),
      });
      break;
    }

    case "i_walletGetCallsStatus": {
      const { id, bundleId } = e.data.msg as {
        id: string;
        bundleId: string;
      };

      const requestId = crypto.randomUUID();

      waitForStorageResult<any>(
        `callsStatusResult:${requestId}`, 15 * 1000
      ).then((result) => {
        window.postMessage(
          { type: "walletGetCallsStatusResult", msg: { id, success: true, result } },
          "*"
        );
      }).catch((err) => {
        window.postMessage(
          { type: "walletGetCallsStatusResult", msg: { id, success: false, error: err.message } },
          "*"
        );
      });

      chrome.runtime.sendMessage({
        type: "walletGetCallsStatus",
        requestId,
        bundleId,
      });
      break;
    }

    case "i_walletShowCallsStatus": {
      const { bundleId } = e.data.msg as { bundleId: string };
      chrome.runtime.sendMessage({
        type: "walletShowCallsStatus",
        bundleId,
      });
      break;
    }
  }
});

init();

// to remove isolated modules error
export {};
