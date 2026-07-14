import {
  NETWORK_RPC_URLS_STORAGE_KEY,
  normalizeSavedRpcEndpoints,
  type SavedRpcEndpoint,
} from "@/lib/chains";

export type NetworkRpcEndpointHistory = Record<string, SavedRpcEndpoint[]>;

const MAX_RPC_HISTORY_CHAINS = 100;

function chainKey(chainId: unknown): string {
  const parsed = Number(chainId);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Valid chain ID is required.");
  }
  return String(parsed);
}

export function decodeNetworkRpcUrlHistory(
  value: unknown,
): NetworkRpcEndpointHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const decoded: NetworkRpcEndpointHistory = {};
  for (const [key, candidate] of Object.entries(value).slice(
    0,
    MAX_RPC_HISTORY_CHAINS,
  )) {
    try {
      const normalizedKey = chainKey(key);
      const endpoints = normalizeSavedRpcEndpoints(undefined, candidate);
      if (endpoints.length) decoded[normalizedKey] = endpoints;
    } catch {
      // Ignore malformed or non-chain keys from manually modified storage.
    }
  }
  return decoded;
}

async function readHistory(): Promise<NetworkRpcEndpointHistory> {
  const stored = await chrome.storage.local.get(NETWORK_RPC_URLS_STORAGE_KEY);
  return decodeNetworkRpcUrlHistory(stored[NETWORK_RPC_URLS_STORAGE_KEY]);
}

export async function getNetworkRpcEndpoints(
  chainId: unknown,
  activeRpcUrl: unknown,
): Promise<SavedRpcEndpoint[]> {
  const history = await readHistory();
  return normalizeSavedRpcEndpoints(activeRpcUrl, history[chainKey(chainId)]);
}

export async function saveNetworkRpcEndpoints(
  chainId: unknown,
  activeRpcUrl: unknown,
  endpoints: unknown,
): Promise<SavedRpcEndpoint[]> {
  const key = chainKey(chainId);
  const history = await readHistory();
  if (!(key in history) && Object.keys(history).length >= MAX_RPC_HISTORY_CHAINS) {
    throw new Error("Too many networks have saved RPC endpoints.");
  }

  const normalized = normalizeSavedRpcEndpoints(activeRpcUrl, endpoints);
  history[key] = normalized;
  await chrome.storage.local.set({ [NETWORK_RPC_URLS_STORAGE_KEY]: history });
  return normalized;
}

export async function moveNetworkRpcEndpoints(
  previousChainId: unknown,
  nextChainId: unknown,
  activeRpcUrl: unknown,
  endpoints: unknown,
): Promise<SavedRpcEndpoint[]> {
  const previousKey = chainKey(previousChainId);
  const nextKey = chainKey(nextChainId);
  const history = await readHistory();

  if (previousKey !== nextKey) delete history[previousKey];
  if (
    !(nextKey in history) &&
    Object.keys(history).length >= MAX_RPC_HISTORY_CHAINS
  ) {
    throw new Error("Too many networks have saved RPC endpoints.");
  }

  const normalized = normalizeSavedRpcEndpoints(activeRpcUrl, endpoints);
  history[nextKey] = normalized;
  await chrome.storage.local.set({ [NETWORK_RPC_URLS_STORAGE_KEY]: history });
  return normalized;
}

export async function removeNetworkRpcUrls(chainId: unknown): Promise<void> {
  const key = chainKey(chainId);
  const history = await readHistory();
  if (!(key in history)) return;
  delete history[key];
  await chrome.storage.local.set({ [NETWORK_RPC_URLS_STORAGE_KEY]: history });
}
