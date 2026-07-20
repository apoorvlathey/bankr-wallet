import { classifyPrivateNetworkHostname } from "@/lib/privateNetworkPolicy";
import { fetchTextBounded, parseJsonObjectBounded } from "../network/boundedHttp";

const SAFE_CONFIG_URL = "https://safe-config.safe.global/api/v1/chains/?limit=100";
const SAFE_CONFIG_TTL_MS = 15 * 60_000;
const SAFE_CONFIG_TIMEOUT_MS = 12_000;
const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_SAFE_CHAINS = 100;

/** Safe documents zkSync Era as non-EVM compatible. */
const NON_EVM_SAFE_CHAIN_IDS = new Set([324]);

export interface SafeServiceChain {
  chainId: number;
  chainName: string;
  shortName: string;
  transactionService: string;
  publicRpcUrl?: string;
  isTestnet: boolean;
}

let cached:
  | { expiresAt: number; chains: readonly SafeServiceChain[] }
  | undefined;
let pending: Promise<readonly SafeServiceChain[]> | undefined;

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`Invalid Safe ${label}`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw new Error(`Invalid Safe ${label}`);
  return trimmed;
}

function parseTransactionService(value: unknown): string {
  const raw = requiredText(value, "transaction service", 300);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid Safe transaction service");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.safe.global" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/tx-service\/[a-z0-9-]+\/?$/.test(url.pathname)
  ) {
    throw new Error("Invalid Safe transaction service");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function parsePublicRpc(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as { authentication?: unknown; value?: unknown };
  if (candidate.authentication !== "NO_AUTHENTICATION") return undefined;
  if (typeof candidate.value !== "string" || candidate.value.length > 2_048) return undefined;
  try {
    const url = new URL(candidate.value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      classifyPrivateNetworkHostname(url.hostname) !== null
    ) {
      return undefined;
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

export function parseSafeServiceChains(payload: unknown): SafeServiceChain[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid Safe chain configuration");
  }
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0 || results.length > MAX_SAFE_CHAINS) {
    throw new Error("Invalid Safe chain configuration");
  }

  const byChainId = new Map<number, SafeServiceChain>();
  for (const raw of results) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid Safe chain configuration");
    }
    const item = raw as Record<string, unknown>;
    const chainId = Number(item.chainId);
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new Error("Invalid Safe chain ID");
    }
    if (NON_EVM_SAFE_CHAIN_IDS.has(chainId)) continue;
    if (byChainId.has(chainId)) throw new Error("Duplicate Safe chain ID");

    byChainId.set(chainId, {
      chainId,
      chainName: requiredText(item.chainName, "chain name", 100),
      shortName: requiredText(item.shortName, "short name", 40).toLowerCase(),
      transactionService: parseTransactionService(item.transactionService),
      publicRpcUrl: parsePublicRpc(item.publicRpcUri),
      isTestnet: item.isTestnet === true,
    });
  }
  if (byChainId.size === 0) throw new Error("Safe has no supported EVM chains");
  return [...byChainId.values()].sort((a, b) => a.chainId - b.chainId);
}

async function fetchSafeServiceChains(): Promise<readonly SafeServiceChain[]> {
  const { response, text } = await fetchTextBounded(
    SAFE_CONFIG_URL,
    {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    },
    { timeoutMs: SAFE_CONFIG_TIMEOUT_MS, maxBytes: MAX_CONFIG_BYTES },
  );
  if (!response.ok) throw new Error(`Safe chain configuration failed: ${response.status}`);
  return parseSafeServiceChains(parseJsonObjectBounded(text, "Invalid Safe chain configuration"));
}

export async function getSafeServiceChains(): Promise<readonly SafeServiceChain[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.chains;
  if (!pending) {
    pending = fetchSafeServiceChains()
      .then((chains) => {
        cached = { expiresAt: Date.now() + SAFE_CONFIG_TTL_MS, chains };
        return chains;
      })
      .finally(() => {
        pending = undefined;
      });
  }
  return pending;
}

export async function getSafeServiceChain(chainId: number): Promise<SafeServiceChain | undefined> {
  return (await getSafeServiceChains()).find((chain) => chain.chainId === chainId);
}

export function clearSafeServiceRegistryCacheForTests(): void {
  cached = undefined;
  pending = undefined;
}
