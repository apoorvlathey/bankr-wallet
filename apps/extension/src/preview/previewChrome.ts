import { DEFAULT_NETWORKS } from "@/constants/networks";
import type { Account } from "@/chrome/types";
import type { GasEstimate } from "@/chrome/gasEstimation";
import type { SimulationResult } from "@/chrome/txSimulation";
import { SELECTED_THEME_STORAGE_KEY } from "@/theme";

type StorageAreaName = "local" | "sync" | "session";
type StorageRecord = Record<string, unknown>;
type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: StorageAreaName,
) => void;

const PREVIEW_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

const previewAccounts: Account[] = [
  {
    id: "preview-bankr",
    type: "bankr",
    address: PREVIEW_ADDRESS,
    displayName: "Bankr vault",
    createdAt: Date.now() - 86400000,
  },
  {
    id: "preview-pk",
    type: "privateKey",
    address: "0x1111111111111111111111111111111111111111",
    displayName: "Local signer",
    createdAt: Date.now() - 43200000,
  },
  {
    id: "preview-seed-0",
    type: "seedPhrase",
    address: "0x2222222222222222222222222222222222222222",
    displayName: "Seed #1",
    seedGroupId: "preview-seed",
    derivationIndex: 0,
    createdAt: Date.now() - 21600000,
  },
];

const gasEstimate: GasEstimate = {
  gasLimit: "138000",
  maxFeePerGas: "125000000",
  maxPriorityFeePerGas: "25000000",
  baseFee: "100000000",
  estimatedCostWei: "17250000000000",
  nativePriceUsd: 3600,
  nativeCurrencySymbol: "ETH",
  accountBalance: "3000000000000000000",
  insufficientBalance: false,
  estimationFailed: false,
  dappProvidedGas: false,
  tiers: {
    slow: {
      maxFeePerGas: "115000000",
      maxPriorityFeePerGas: "15000000",
    },
    standard: {
      maxFeePerGas: "125000000",
      maxPriorityFeePerGas: "25000000",
    },
    fast: {
      maxFeePerGas: "145000000",
      maxPriorityFeePerGas: "45000000",
    },
  },
};

const simulationResult: SimulationResult = {
  txSuccess: true,
  simulationFailed: false,
  metadataComplete: true,
  nativeChange: {
    address: "native",
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    rawDelta: "-42000000000000000",
    formattedAmount: "0.042",
    valueUsd: 151.2,
    direction: "out",
  },
  tokenChanges: [
    {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      rawDelta: "148620000",
      formattedAmount: "148.62",
      valueUsd: 148.62,
      direction: "in",
    },
  ],
};

const storage: Record<StorageAreaName, StorageRecord> = {
  local: {
    [SELECTED_THEME_STORAGE_KEY]:
      window.localStorage.getItem(SELECTED_THEME_STORAGE_KEY) ?? "midnight",
  },
  sync: {
    networksInfo: DEFAULT_NETWORKS,
    address: PREVIEW_ADDRESS,
    displayAddress: "preview.walletchan.eth",
    chainName: "Base",
    activeAccountId: "preview-bankr",
    defaultGasTier: "standard",
    hidePortfolioValue: false,
    sidePanelMode: false,
  },
  session: {},
};

const storageListeners = new Set<StorageListener>();
const runtimeMessageListeners = new Set<(...args: unknown[]) => void>();

function normalizeStorageKeys(keys?: string | string[] | StorageRecord | null): string[] | null {
  if (!keys) return null;
  if (typeof keys === "string") return [keys];
  if (Array.isArray(keys)) return keys;
  return Object.keys(keys);
}

function getStorage(area: StorageAreaName, keys?: string | string[] | StorageRecord | null) {
  const source = storage[area];
  const normalized = normalizeStorageKeys(keys);
  if (!normalized) return { ...source };

  const result: StorageRecord = {};
  for (const key of normalized) {
    if (key in source) result[key] = source[key];
    else if (keys && typeof keys === "object" && !Array.isArray(keys)) {
      result[key] = keys[key];
    }
  }
  return result;
}

function setStorage(area: StorageAreaName, values: StorageRecord) {
  const changes: Record<string, chrome.storage.StorageChange> = {};
  for (const [key, value] of Object.entries(values)) {
    const oldValue = storage[area][key];
    storage[area][key] = value;
    changes[key] = { oldValue, newValue: value };
    if (area === "local" && key === SELECTED_THEME_STORAGE_KEY && typeof value === "string") {
      document.documentElement.dataset.theme = value;
      window.localStorage.setItem(SELECTED_THEME_STORAGE_KEY, value);
    }
  }
  for (const listener of storageListeners) listener(changes, area);
}

function makeStorageArea(area: StorageAreaName) {
  return {
    get: (
      keys?: string | string[] | StorageRecord | null,
      callback?: (items: StorageRecord) => void,
    ) => {
      const result = getStorage(area, keys);
      callback?.(result);
      return Promise.resolve(result);
    },
    set: (values: StorageRecord, callback?: () => void) => {
      setStorage(area, values);
      callback?.();
      return Promise.resolve();
    },
    remove: (keys: string | string[], callback?: () => void) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const key of keyList) {
        const oldValue = storage[area][key];
        delete storage[area][key];
        changes[key] = { oldValue, newValue: undefined };
      }
      for (const listener of storageListeners) listener(changes, area);
      callback?.();
      return Promise.resolve();
    },
  };
}

function responseForMessage(message: any): unknown {
  switch (message?.type) {
    case "ensureNetworksInfo":
      return { success: true, networksInfo: DEFAULT_NETWORKS };
    case "getAccounts":
      return previewAccounts;
    case "getTxHistory":
      return [];
    case "isSidePanelSupported":
      return { supported: true };
    case "getSidePanelMode":
      return { enabled: false };
    case "setSidePanelMode":
    case "setArcBrowser":
    case "clearNonceCache":
      return { success: true };
    case "isAgentPasswordEnabled":
      return { enabled: true };
    case "getPasswordType":
      return { passwordType: "master" };
    case "unlockWallet":
      return { success: true };
    case "resetExtension":
      return { success: true };
    case "estimateGas":
    case "estimateForceInclusionGas":
      return gasEstimate;
    case "simulateAssetChanges":
    case "simulateBatchAssetChanges":
    case "simulateBatchAssetChangesNonAtomic":
      return simulationResult;
    case "retryTokenMetadata":
      return { tokenChanges: simulationResult.tokenChanges };
    case "fetchTokenInfo":
      return {
        success: true,
        data: {
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
        },
      };
    case "resolveTokenMetadata":
      return {
        success: true,
        data: {
          name:
            String(message?.tokenAddress || "").toLowerCase() === "native"
              ? "Ether"
              : "USD Coin",
          symbol:
            String(message?.tokenAddress || "").toLowerCase() === "native"
              ? "ETH"
              : "USDC",
          decimals:
            String(message?.tokenAddress || "").toLowerCase() === "native"
              ? 18
              : 6,
          logoUrl:
            String(message?.tokenAddress || "").toLowerCase() === "native"
              ? undefined
              : "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
        },
      };
    case "getDelegationStatus":
      return {
        success: true,
        delegate: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
        source: "default",
        needsAuthorization: false,
        onchainDelegate: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
      };
    case "confirmTransactionAsync":
    case "confirmTransactionAsyncPK":
    case "confirmSignatureRequest":
    case "confirmBatchTransactionAsync":
    case "confirmBatchTransactionAsyncPK":
    case "confirmErc7715PermissionRequest":
    case "rejectTransaction":
    case "rejectSignatureRequest":
    case "rejectBatchTransaction":
    case "rejectErc7715PermissionRequest":
    case "addToCrossDappBatch":
    case "addCallsToCrossDappBatch":
    case "updatePendingTxRequestData":
    case "updateCallInPendingBatch":
    case "splitBatchIntoIndividualTxs":
      return { success: true };
    default:
      return { success: true };
  }
}

export function installPreviewChrome() {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) return;

  const previewChrome = {
    runtime: {
      id: "walletchan-preview",
      lastError: null,
      getManifest: () => ({ version: "preview" }),
      getURL: (path: string) => `/${path.replace(/^\//, "")}`,
      connect: () => ({
        name: "preview-port",
        disconnect: () => {},
        onDisconnect: { addListener: () => {}, removeListener: () => {} },
        postMessage: () => {},
      }),
      sendMessage: (message: any, callback?: (response: any) => void) => {
        const response = responseForMessage(message);
        window.setTimeout(() => callback?.(response), 80);
        return Promise.resolve(response);
      },
      onMessage: {
        addListener: (listener: (...args: unknown[]) => void) => {
          runtimeMessageListeners.add(listener);
        },
        removeListener: (listener: (...args: unknown[]) => void) => {
          runtimeMessageListeners.delete(listener);
        },
      },
    },
    storage: {
      local: makeStorageArea("local"),
      sync: makeStorageArea("sync"),
      session: makeStorageArea("session"),
      onChanged: {
        addListener: (listener: StorageListener) => storageListeners.add(listener),
        removeListener: (listener: StorageListener) => storageListeners.delete(listener),
      },
    },
    tabs: {
      query: () =>
        Promise.resolve([
          {
            id: 1,
            url: "https://app.uniswap.org/swap",
            active: true,
            windowId: 1,
          },
        ]),
      create: () => Promise.resolve({ id: 2 }),
      update: () => Promise.resolve({ id: 1 }),
      remove: () => Promise.resolve(),
      sendMessage: (_tabId: number, _message: unknown, callback?: (response: unknown) => void) => {
        callback?.({ success: true });
      },
      onActivated: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
    windows: {
      getCurrent: () => Promise.resolve({ id: 1, type: "normal" }),
      update: () => Promise.resolve({ id: 1 }),
    },
    sidePanel: {
      open: () => Promise.resolve(),
    },
    action: {
      setBadgeText: () => Promise.resolve(),
      setBadgeBackgroundColor: () => Promise.resolve(),
    },
    notifications: {
      create: () => Promise.resolve("preview-notification"),
    },
  };

  (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome =
    previewChrome as unknown as typeof chrome;
}
