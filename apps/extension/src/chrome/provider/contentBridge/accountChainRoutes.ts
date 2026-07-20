import type { NetworksInfo } from "@/types";
import { getResolvedChainById } from "@/lib/chains";
import { waitForStorageResult } from "../../storageResultWaiter";
import {
  bridgeState,
  notifyDappChainSwitch,
  pageFaviconUrl,
} from "./bridgeState";

function post(type: string, msg: Record<string, unknown>): void {
  window.postMessage({ type, msg }, "*");
}

async function handleDappAccounts(msg: any): Promise<void> {
  const { id, method } = msg as {
    id: string;
    method: "eth_accounts" | "eth_requestAccounts";
  };
  if (method !== "eth_accounts" && method !== "eth_requestAccounts") return;
  if (method === "eth_accounts") {
    chrome.runtime
      .sendMessage({ type: "getDappAccounts", chainId: bridgeState.chainId })
      .then((result) => {
        bridgeState.dappConnected =
          result?.success === true &&
          Array.isArray(result.accounts) &&
          typeof result.accounts[0] === "string";
        post("dappAccountsResult", {
          id,
          success: result?.success === true,
          accounts: result?.accounts || [],
          error: result?.error,
          code: result?.code,
        });
      })
      .catch((error) => {
        bridgeState.dappConnected = false;
        post("dappAccountsResult", {
          id,
          success: false,
          error: error?.message || "Account request failed",
        });
      });
    return;
  }

  const requestId = crypto.randomUUID();
  waitForStorageResult<{
    success: boolean;
    accounts?: string[];
    error?: string;
    code?: number;
  }>(
    `dappConnectionResult:${requestId}`,
    null,
  )
    .then((result) => {
      bridgeState.dappConnected =
        result.success === true &&
        Array.isArray(result.accounts) &&
        typeof result.accounts[0] === "string";
      post("dappAccountsResult", { id, ...result });
    })
    .catch((error) => {
      bridgeState.dappConnected = false;
      post("dappAccountsResult", {
        id,
        success: false,
        error: error?.message || "Connection request failed",
      });
    });
  chrome.runtime.sendMessage({
    type: "requestDappConnection",
    requestId,
    title: document.title?.trim().slice(0, 120) || undefined,
    favicon: pageFaviconUrl(),
    chainId: bridgeState.chainId,
  });
}

async function hasConnectedAccount(): Promise<boolean> {
  const permission = await chrome.runtime
    .sendMessage({ type: "getDappAccounts", chainId: bridgeState.chainId })
    .catch(() => null);
  return Array.isArray(permission?.accounts) && permission.accounts.length > 0;
}

async function handleSwitchChain(msg: any): Promise<void> {
  const chainId = msg.chainId as number;
  if (!(await hasConnectedAccount())) {
    post("switchEthereumChainError", {
      chainId,
      error: "Connect this site before switching networks",
      code: 4100,
    });
    return;
  }
  const { networksInfo } = (await chrome.storage.sync.get(
    "networksInfo",
  )) as { networksInfo?: NetworksInfo };
  if (!networksInfo) {
    post("switchEthereumChainError", {
      chainId,
      error: "Networks not configured",
      code: 4902,
    });
    return;
  }
  const resolved = getResolvedChainById(chainId, networksInfo);
  if (!resolved?.rpcUrl || !resolved.name) {
    post("switchEthereumChainError", {
      chainId,
      error: `Chain ${chainId} is not supported`,
      code: 4902,
    });
    return;
  }
  const previousChainName = bridgeState.chainName;
  bridgeState.chainName = resolved.name;
  bridgeState.chainId = chainId;
  await chrome.storage.sync.set({ chainName: resolved.name });
  if (previousChainName !== resolved.name) {
    notifyDappChainSwitch(chainId, resolved.name);
  }
  post("switchEthereumChain", { chainId });
}

interface AddChainMessage {
  id: string;
  chainId: number;
  chainName?: string;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  rpcUrls?: string[];
  blockExplorerUrls?: string[];
}

function postAddChainFailure(id: string, error: string, code?: number): void {
  post("addEthereumChainResult", { id, success: false, error, code });
}

export function existingAddChainNeedsApproval(
  chainId: number,
  networksInfo: NetworksInfo | undefined,
): boolean {
  return getResolvedChainById(chainId, networksInfo)?.hidden === true;
}

async function handleAddChain(msg: AddChainMessage): Promise<void> {
  const { id, chainId, chainName, nativeCurrency, rpcUrls, blockExplorerUrls } = msg;
  if (!(await hasConnectedAccount())) {
    postAddChainFailure(id, "Connect this site before adding networks", 4100);
    return;
  }
  const { networksInfo } = (await chrome.storage.sync.get(
    "networksInfo",
  )) as { networksInfo?: NetworksInfo };
  const resolved = getResolvedChainById(chainId, networksInfo);
  if (resolved && !existingAddChainNeedsApproval(chainId, networksInfo)) {
    const shouldSwitch =
      bridgeState.accountType !== "bankr" ||
      resolved.isBankrSupported === true;
    if (shouldSwitch) {
      bridgeState.chainName = resolved.name;
      bridgeState.chainId = chainId;
      await chrome.storage.sync.set({ chainName: resolved.name });
    }
    post("addEthereumChainResult", {
      id,
      success: true,
      chainId,
      shouldSwitch,
    });
    if (shouldSwitch) post("switchEthereumChain", { chainId });
    return;
  }

  const requestId = crypto.randomUUID();
  waitForStorageResult<{
    success: boolean;
    error?: string;
    code?: number;
    chainName?: string;
    shouldSwitch?: boolean;
  }>(
    `addChainResult:${requestId}`,
    null,
  )
    .then((result) => {
      if (result.success && result.chainName) {
        if (result.shouldSwitch !== false) {
          bridgeState.chainName = result.chainName;
          bridgeState.chainId = chainId;
          chrome.storage.sync
            .set({ chainName: result.chainName })
            .catch(() => undefined);
        }
        post("addEthereumChainResult", {
          id,
          success: true,
          chainId,
          shouldSwitch: result.shouldSwitch,
        });
        if (result.shouldSwitch !== false) post("switchEthereumChain", { chainId });
        return;
      }
      postAddChainFailure(
        id,
        result.error || "User rejected",
        result.code ??
          (!result.error || /reject/i.test(result.error) ? 4001 : undefined),
      );
    })
    .catch((error) => postAddChainFailure(id, error.message));

  chrome.runtime.sendMessage({
    type: "addEthereumChain",
    requestId,
    chainId,
    chainName,
    nativeCurrency,
    rpcUrls,
    blockExplorerUrls,
    origin: window.location.origin,
    favicon: pageFaviconUrl(),
  });
}

export async function handleAccountChainPageMessage(
  type: string,
  msg: any,
): Promise<boolean> {
  switch (type) {
    case "i_dappAccounts":
      await handleDappAccounts(msg);
      return true;
    case "i_switchEthereumChain":
      await handleSwitchChain(msg);
      return true;
    case "i_addEthereumChain":
      await handleAddChain(msg);
      return true;
    default:
      return false;
  }
}
