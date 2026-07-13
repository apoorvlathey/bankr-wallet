import { NetworksInfo } from "../types";
import { getResolvedChainById } from "@/lib/chains";
import {
  resolveProviderActiveChainId,
  validateProviderChainBoundary,
} from "./providerChainBoundary";
import { sanitizeUntrustedImageUrl } from "@/lib/remoteImagePolicy";
import { waitForStorageResult } from "./storageResultWaiter";

const ERC7715_PERMISSION_RESULT_PREFIX = "erc7715PermissionResult:";
const ERC7715_PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;
const UNCONNECTED_ADDRESS = "0x0000000000000000000000000000000000000000";

function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function redirectW3linkToInterstitial(): void {
  if (!isTopFrame()) return;
  const host = location.hostname.toLowerCase().replace(/\.$/, "");
  if (!/^(0x[a-f0-9]{40})\.1\.w3link\.io$/.test(host)) return;

  const url = `${chrome.runtime.getURL("interstitial.html")}#${location.href}`;
  location.replace(url);
}

// DNR can miss this gateway navigation in practice, so keep a document_start
// fallback in the global content script.
redirectW3linkToInterstitial();

function parseEnsGatewayName(hostname: string): string | null {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  const ethGateway = lower.match(/^((?:[a-z0-9-]+\.)+eth)\.(?:limo|link)$/);
  if (ethGateway?.[1]) return ethGateway[1];

  const w3eth = lower.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.w3eth\.io$/);
  if (!w3eth?.[1] || /^0x[a-f0-9]{40}$/.test(w3eth[1])) return null;
  return `${w3eth[1]}.eth`;
}

function safeFaviconUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) return url;
  return undefined;
}

function scrapeEnsGatewayMetadata(): { title?: string; favicon?: string } {
  const title = document.title?.trim() || undefined;
  const selectors = [
    'link[rel~="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="apple-touch-icon-precomposed"]',
  ];
  let favicon: string | undefined;
  for (const selector of selectors) {
    const el = document.querySelector(selector) as HTMLLinkElement | null;
    const href = el?.getAttribute("href");
    if (!href) continue;
    try {
      favicon = safeFaviconUrl(new URL(href, location.href).toString());
      if (favicon) break;
    } catch {
      // Ignore malformed favicon hrefs.
    }
  }
  return { title, favicon };
}

function sendEnsGatewayMetadata(ensName: string): void {
  const metadata = scrapeEnsGatewayMetadata();
  if (!metadata.title && !metadata.favicon) return;
  chrome.runtime
    .sendMessage({
      type: "ens-cache-metadata",
      name: ensName,
      title: metadata.title,
      favicon: metadata.favicon,
    })
    .catch(() => undefined);
}

function scheduleEnsGatewayMetadataCapture(): void {
  const ensName = parseEnsGatewayName(location.hostname);
  if (!ensName) return;
  const capture = () => sendEnsGatewayMetadata(ensName);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", capture, { once: true });
  } else {
    queueMicrotask(capture);
  }
  window.addEventListener("load", capture, { once: true });
  window.setTimeout(capture, 1500);
}

scheduleEnsGatewayMetadataCapture();

/**
 * Get the favicon URL from the current page
 */
function getFaviconUrl(): string | null {
  // Try standard favicon link elements
  const standardFavicon = document.querySelector(
    'link[rel="icon"], link[rel="shortcut icon"]'
  ) as HTMLLinkElement | null;
  if (standardFavicon?.href) {
    return sanitizeUntrustedImageUrl(standardFavicon.href);
  }

  // Try Apple touch icon (usually higher quality)
  const appleTouchIcon = document.querySelector(
    'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
  ) as HTMLLinkElement | null;
  if (appleTouchIcon?.href) {
    return sanitizeUntrustedImageUrl(appleTouchIcon.href);
  }

  // Fallback to default /favicon.ico
  return sanitizeUntrustedImageUrl(
    new URL("/favicon.ico", window.location.origin).href,
  );
}

let store = {
  address: "",
  displayAddress: "",
  chainName: "",
  accountId: "",      // Current account ID
  accountType: "",    // "bankr" | "privateKey"
};

async function getAttestedProviderChainId(): Promise<number | null> {
  const { networksInfo } = (await chrome.storage.sync.get(
    "networksInfo",
  )) as { networksInfo?: NetworksInfo };
  return resolveProviderActiveChainId(store.chainName, networksInfo);
}

function notifyDappChainSwitch(chainId: number, chainName: string): void {
  chrome.runtime
    .sendMessage({
      type: "dappChainSwitchNotification",
      chainId,
      chainName,
    })
    .catch(() => {});
}

const init = async () => {
  // inject inpage.js into webpage
  try {
    let script = document.createElement("script");
    script.setAttribute("type", "text/javascript");
    script.src = chrome.runtime.getURL("/static/js/inpage.js");
    script.onload = async function () {
      // @ts-ignore
      this.remove();

      // Resolve account identity from the sender-bound tab mapping before the
      // provider is announced. Global address fields are legacy fallbacks only.
      const [account, syncState, dappAccounts] = await Promise.all([
        chrome.runtime.sendMessage({ type: "getActiveAccount" }).catch(() => null),
        chrome.storage.sync.get([
          "address",
          "displayAddress",
          "chainName",
          "networksInfo",
        ]),
        chrome.runtime
          .sendMessage({ type: "getDappAccounts" })
          .catch(() => ({ accounts: [] })),
      ]);
      const address = account?.address || syncState.address;
      const displayAddress =
        account?.displayName || account?.address || syncState.displayAddress || address;
      const chainName = syncState.chainName as string | undefined;
      const networksInfo = syncState.networksInfo as NetworksInfo | undefined;

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
          accountId: account?.id || "",
          accountType: account?.type || "",
        };

        window.postMessage(
          {
            type: "init",
            msg: {
              address:
                Array.isArray(dappAccounts?.accounts) &&
                typeof dappAccounts.accounts[0] === "string"
                  ? dappAccounts.accounts[0]
                  : UNCONNECTED_ADDRESS,
              chainId: networksInfo[chainName].chainId,
            },
          },
          "*"
        );
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

        chrome.runtime.sendMessage({ type: "getDappAccounts" }).then((result) => {
          const exposedAddress =
            Array.isArray(result?.accounts) &&
            typeof result.accounts[0] === "string"
              ? result.accounts[0]
              : UNCONNECTED_ADDRESS;
          window.postMessage(
            {
              ...msgObj,
              msg: {
                ...msgObj.msg,
                address: exposedAddress,
                emitAccountsChanged:
                  addressChanged && result?.accounts?.length > 0,
              },
            },
            "*",
          );
        }).catch(() => {
          window.postMessage(
            {
              ...msgObj,
              msg: {
                ...msgObj.msg,
                address: UNCONNECTED_ADDRESS,
                emitAccountsChanged: false,
              },
            },
            "*",
          );
        });
        break;
      }
      case "setChainId": {
        const chainName = msgObj.msg.chainName as string;

        store.chainName = chainName;

        // Never expose extension-configured RPC URLs (which may contain API
        // credentials) to page context.
        window.postMessage(
          {
            type: "setChainId",
            msg: { chainId: msgObj.msg.chainId },
          },
          "*",
        );
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

        chrome.runtime.sendMessage({ type: "getDappAccounts" }).then((result) => {
          const exposedAddress =
            Array.isArray(result?.accounts) &&
            typeof result.accounts[0] === "string"
              ? result.accounts[0]
              : UNCONNECTED_ADDRESS;
          window.postMessage({
            type: "setAddress",
            msg: {
              address: exposedAddress,
              emitAccountsChanged: result?.accounts?.length > 0,
            },
          }, "*");
        }).catch(() => {});
        break;
      }
      case "getInfo": {
        sendResponse(store);

        break;
      }
      case "dappPermissionRevoked": {
        window.postMessage({ type: "accountsChanged", msg: { accounts: [] } }, "*");
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
    case "i_dappAccounts": {
      const { id, method } = e.data.msg as {
        id: string;
        method: "eth_accounts" | "eth_requestAccounts";
      };
      if (method !== "eth_accounts" && method !== "eth_requestAccounts") {
        break;
      }

      if (method === "eth_accounts") {
        chrome.runtime.sendMessage({ type: "getDappAccounts" }).then((result) => {
          window.postMessage({
            type: "dappAccountsResult",
            msg: {
              id,
              success: result?.success === true,
              accounts: result?.accounts || [],
              error: result?.error,
              code: result?.code,
            },
          }, "*");
        }).catch((error) => {
          window.postMessage({
            type: "dappAccountsResult",
            msg: { id, success: false, error: error?.message || "Account request failed" },
          }, "*");
        });
        break;
      }

      const requestId = crypto.randomUUID();
      waitForStorageResult<{
        success: boolean;
        accounts?: string[];
        error?: string;
        code?: number;
      }>(
        `dappConnectionResult:${requestId}`,
        5 * 60 * 1000,
        () =>
          chrome.runtime.sendMessage({
            type: "expireProviderRequest",
            requestKind: "dappConnection",
            requestId,
          }),
      )
        .then((result) => {
          window.postMessage({
            type: "dappAccountsResult",
            msg: { id, ...result },
          }, "*");
        })
        .catch((error) => {
          window.postMessage({
            type: "dappAccountsResult",
            msg: { id, success: false, error: error?.message || "Connection request timed out" },
          }, "*");
        });

      chrome.runtime.sendMessage({
        type: "requestDappConnection",
        requestId,
        title: document.title?.trim().slice(0, 120) || undefined,
        favicon: getFaviconUrl(),
      });
      break;
    }
    case "i_switchEthereumChain": {
      const chainId = e.data.msg.chainId as number;
      const permission = await chrome.runtime
        .sendMessage({ type: "getDappAccounts" })
        .catch(() => null);
      if (!Array.isArray(permission?.accounts) || permission.accounts.length === 0) {
        window.postMessage(
          {
            type: "switchEthereumChainError",
            msg: {
              chainId,
              error: "Connect this site before switching networks",
              code: 4100,
            },
          },
          "*",
        );
        break;
      }
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
              code: 4902,
            },
          },
          "*"
        );
        break;
      }

      const resolvedChain = getResolvedChainById(chainId, networksInfo);
      const rpcUrl = resolvedChain?.rpcUrl;
      const chainName = resolvedChain?.name;

      if (!rpcUrl || !chainName) {
        // Chain not supported - send error back to impersonator
        window.postMessage(
          {
            type: "switchEthereumChainError",
            msg: {
              chainId,
              error: `Chain ${chainId} is not supported`,
              code: 4902,
            },
          },
          "*"
        );
        break;
      }

      const previousChainName = store.chainName;
      store.chainName = chainName;

      // Save chainName to storage so popup/sidepanel reflects the change
      await chrome.storage.sync.set({ chainName });
      if (previousChainName !== chainName) {
        notifyDappChainSwitch(chainId, chainName);
      }

      // send message to switchEthereumChain with RPC, in impersonator.ts
      window.postMessage(
        {
          type: "switchEthereumChain",
          msg: {
            chainId,
          },
        },
        "*"
      );
      break;
    }

    case "i_addEthereumChain": {
      const {
        id,
        chainId,
        chainName: reqChainName,
        nativeCurrency,
        rpcUrls,
        blockExplorerUrls,
      } = e.data.msg as {
        id: string;
        chainId: number;
        chainName?: string;
        nativeCurrency?: { name: string; symbol: string; decimals: number };
        rpcUrls?: string[];
        blockExplorerUrls?: string[];
      };

      const permission = await chrome.runtime
        .sendMessage({ type: "getDappAccounts" })
        .catch(() => null);
      if (!Array.isArray(permission?.accounts) || permission.accounts.length === 0) {
        window.postMessage(
          {
            type: "addEthereumChainResult",
            msg: {
              id,
              success: false,
              error: "Connect this site before adding networks",
              code: 4100,
            },
          },
          "*",
        );
        break;
      }

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
                msg: {
                  id,
                  success: true,
                  chainId,
                  shouldSwitch,
                },
              },
              "*"
            );
            if (shouldSwitch) {
              // Also emit switchEthereumChain so provider updates chainId
              window.postMessage(
                {
                  type: "switchEthereumChain",
                  msg: { chainId },
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

      waitForStorageResult<{ success: boolean; error?: string; code?: number; rpcUrl?: string; chainName?: string; shouldSwitch?: boolean }>(
        `addChainResult:${addChainRequestId}`,
        5 * 60 * 1000,
        () =>
          chrome.runtime.sendMessage({
            type: "expireProviderRequest",
            requestKind: "addChain",
            requestId: addChainRequestId,
          }),
      )
        .then((result) => {
          if (result.success && result.chainName) {
            if (result.shouldSwitch !== false) {
              store.chainName = result.chainName;
              chrome.storage.sync.set({ chainName: result.chainName }).catch(() => {});
            }
            window.postMessage(
              {
                type: "addEthereumChainResult",
                msg: {
                  id,
                  success: true,
                  chainId,
                  shouldSwitch: result.shouldSwitch,
                },
              },
              "*"
            );
            if (result.shouldSwitch !== false) {
              window.postMessage(
                {
                  type: "switchEthereumChain",
                  msg: { chainId },
                },
                "*"
              );
            }
          } else {
            window.postMessage(
              {
                type: "addEthereumChainResult",
                msg: {
                  id,
                  success: false,
                  error: result.error || "User rejected",
                  code:
                    result.code ??
                    (!result.error || /reject/i.test(result.error)
                      ? 4001
                      : undefined),
                },
              },
              "*"
            );
          }
        })
        .catch((err) => {
          window.postMessage(
            {
              type: "addEthereumChainResult",
              msg: { id, success: false, error: err.message },
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

      const providerChainId = await getAttestedProviderChainId();
      const chainBoundary = validateProviderChainBoundary(
        chainId,
        providerChainId,
      );
      if (!chainBoundary.valid) {
        window.postMessage(
          {
            type: "sendTransactionResult",
            msg: {
              id,
              success: false,
              error: chainBoundary.error,
              code: 4901,
            },
          },
          "*",
        );
        break;
      }

      // Generate txId here and watch storage — no sendMessage callback needed
      const txId = crypto.randomUUID();

      // Start watching for result BEFORE sending message (avoids race condition)
      waitForStorageResult<{ success: boolean; txHash?: string; error?: string; code?: number }>(
        `txResult:${txId}`,
        5 * 60 * 1000,
        () =>
          chrome.runtime.sendMessage({
            type: "expireProviderRequest",
            requestKind: "transaction",
            requestId: txId,
          }),
      ).then((result) => {
        window.postMessage(
          { type: "sendTransactionResult", msg: { id, success: result.success, txHash: result.txHash, error: result.error, code: result.code } },
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
          from, to, data, value, chainId: chainBoundary.chainId,
          ...(gas ? { gas } : {}),
          ...(gasPrice ? { gasPrice } : {}),
          ...(maxFeePerGas ? { maxFeePerGas } : {}),
          ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
        },
        providerChainId: chainBoundary.chainId,
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

      const providerChainId = await getAttestedProviderChainId();
      const chainBoundary = validateProviderChainBoundary(
        chainId,
        providerChainId,
      );
      if (!chainBoundary.valid) {
        window.postMessage(
          {
            type: "signatureRequestResult",
            msg: {
              id,
              success: false,
              error: chainBoundary.error,
              code: 4901,
            },
          },
          "*",
        );
        break;
      }

      // Generate sigId here and watch storage — no sendMessage callback needed
      const sigId = crypto.randomUUID();

      // Start watching for result BEFORE sending message (avoids race condition)
      waitForStorageResult<{ success: boolean; signature?: string; error?: string; code?: number }>(
        `sigResult:${sigId}`,
        5 * 60 * 1000,
        () =>
          chrome.runtime.sendMessage({
            type: "expireProviderRequest",
            requestKind: "signature",
            requestId: sigId,
          }),
      ).then((result) => {
        window.postMessage(
          { type: "signatureRequestResult", msg: { id, success: result.success, signature: result.signature, error: result.error, code: result.code } },
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
        signature: { method, params, chainId: chainBoundary.chainId },
        providerChainId: chainBoundary.chainId,
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

      const providerChainId = await getAttestedProviderChainId();
      const chainBoundary = validateProviderChainBoundary(
        chainId,
        providerChainId,
      );
      if (!chainBoundary.valid) {
        window.postMessage(
          {
            type: "watchAssetResult",
            msg: { id, success: false, error: chainBoundary.error, code: 4901 },
          },
          "*",
        );
        break;
      }

      const watchAssetId = crypto.randomUUID();

      waitForStorageResult<{ success: boolean; error?: string; code?: number }>(
        `watchAssetResult:${watchAssetId}`,
        5 * 60 * 1000,
        () =>
          chrome.runtime.sendMessage({
            type: "expireProviderRequest",
            requestKind: "watchAsset",
            requestId: watchAssetId,
          }),
      ).then((result) => {
        window.postMessage(
          { type: "watchAssetResult", msg: { id, success: result.success, error: result.error, code: result.code } },
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
        chainId: chainBoundary.chainId,
        providerChainId: chainBoundary.chainId,
        origin: window.location.origin,
        favicon: getFaviconUrl(),
      });
      break;
    }

    case "i_rpcRequest": {
      const { id, method, params } = e.data.msg as {
        id: string;
        method: string;
        params: any[];
      };

      // Resolve RPC URL from extension-controlled networksInfo (never trust the page)
      const { networksInfo: rpcNets } = (await chrome.storage.sync.get(
        "networksInfo"
      )) as { networksInfo: NetworksInfo | undefined };
      const rpcUrl = rpcNets && store.chainName && rpcNets[store.chainName]
        ? rpcNets[store.chainName].rpcUrl
        : undefined;

      if (!rpcUrl) {
        window.postMessage(
          { type: "rpcResponse", msg: { id, result: undefined, error: "No RPC URL configured for current chain" } },
          "*"
        );
        break;
      }

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

      // Fire-and-forget message to background with extension-resolved RPC URL
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
        if (result?.success === false) {
          window.postMessage(
            { type: "walletGetCapabilitiesResult", msg: { id, success: false, error: result.error } },
            "*"
          );
          return;
        }
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

      const providerChainId = await getAttestedProviderChainId();
      const chainBoundary = validateProviderChainBoundary(
        params?.chainId,
        providerChainId,
      );
      if (!chainBoundary.valid) {
        window.postMessage(
          {
            type: "walletSendCallsResult",
            msg: {
              id,
              success: false,
              error: chainBoundary.error,
              code: 4901,
            },
          },
          "*",
        );
        break;
      }

      // Generate bundle ID in content script (not dapp-controlled)
      const bundleId = crypto.randomUUID();

      // Wait for acknowledgment (immediate — background writes this after saving pending request)
      waitForStorageResult<{ success: boolean; id?: string; error?: string; code?: number }>(
        `batchTxAck:${bundleId}`,
        15 * 1000,
        () =>
          chrome.runtime.sendMessage({
            type: "expireProviderRequest",
            requestKind: "batchTransaction",
            requestId: bundleId,
          }),
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
        params: { ...params, chainId: `0x${chainBoundary.chainId.toString(16)}` },
        providerChainId: chainBoundary.chainId,
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
        if (result?.success === false) {
          window.postMessage(
            { type: "walletGetCallsStatusResult", msg: { id, success: false, error: result.error } },
            "*"
          );
          return;
        }
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

    case "i_walletExecutionPermissions": {
      const { id, method, params, chainId } = e.data.msg as {
        id: string;
        method: string;
        params: unknown[];
        chainId: number;
      };

      const providerChainId = await getAttestedProviderChainId();
      const chainBoundary = validateProviderChainBoundary(
        chainId,
        providerChainId,
      );
      if (!chainBoundary.valid) {
        window.postMessage(
          {
            type: "walletExecutionPermissionsResult",
            msg: {
              id,
              success: false,
              error: chainBoundary.error,
              code: 4901,
            },
          },
          "*",
        );
        break;
      }

      try {
        if (method === "wallet_requestExecutionPermissions") {
          const permissionRequestId = crypto.randomUUID();
          const enqueueResult = await chrome.runtime.sendMessage({
            type: "walletExecutionPermissions",
            requestId: permissionRequestId,
            method,
            params,
            chainId: chainBoundary.chainId,
            providerChainId: chainBoundary.chainId,
            origin: window.location.origin,
            favicon: getFaviconUrl(),
          });

          if (enqueueResult?.success !== true) {
            window.postMessage(
              {
                type: "walletExecutionPermissionsResult",
                msg: {
                  id,
                  success: false,
                  error: enqueueResult?.error || `${method} failed`,
                },
              },
              "*",
            );
            break;
          }

          const permissionResult = await waitForStorageResult<{
            success: boolean;
            result?: unknown;
            error?: string;
          }>(
            `${ERC7715_PERMISSION_RESULT_PREFIX}${permissionRequestId}`,
            ERC7715_PERMISSION_TIMEOUT_MS,
            () =>
              chrome.runtime.sendMessage({
                type: "expireProviderRequest",
                requestKind: "erc7715Permission",
                requestId: permissionRequestId,
              }),
          );

          window.postMessage(
            {
              type: "walletExecutionPermissionsResult",
              msg: {
                id,
                success: permissionResult.success === true,
                result: permissionResult.result,
                error:
                  permissionResult.success === true
                    ? undefined
                    : permissionResult.error || `${method} failed`,
              },
            },
            "*",
          );
          break;
        }

        const result = await chrome.runtime.sendMessage({
          type: "walletExecutionPermissions",
          method,
          params,
          chainId: chainBoundary.chainId,
          providerChainId: chainBoundary.chainId,
          origin: window.location.origin,
          favicon: getFaviconUrl(),
        });

        window.postMessage(
          {
            type: "walletExecutionPermissionsResult",
            msg: {
              id,
              success: result?.success === true,
              result: result?.result,
              error:
                result?.success === true
                  ? undefined
                  : result?.error || `${method} failed`,
            },
          },
          "*",
        );
      } catch (err) {
        window.postMessage(
          {
            type: "walletExecutionPermissionsResult",
            msg: {
              id,
              success: false,
              error: err instanceof Error ? err.message : `${method} failed`,
            },
          },
          "*",
        );
      }
      break;
    }
  }
});

init();

// to remove isolated modules error
export {};
