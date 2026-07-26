import { getAddress, isAddress } from "viem";
import { getStoredNetworksInfo, getVisibleChains } from "@/lib/chains";
import { verifySafeOnchainState } from "./onchainState";
import type { SafeAddress, SafeChainSnapshot } from "./types";
import type { Account } from "../types";
import { isSafeOwnerAccount } from "./accountTypePolicy";
import {
  discoverSafesByOwner,
  fetchSafeInfo,
  SafeServiceError,
} from "./serviceClient";
import {
  getSafeServiceChains,
} from "./serviceRegistry";

const MAX_PROBE_CHAINS = 100;
const PROBE_CONCURRENCY = 6;
const SAFE_SERVICE_REQUEST_INTERVAL_MS = 650;
const BASE_SEPOLIA_CHAIN_ID = 84532;

// The first group follows the product's most common Safe networks. Remaining
// mainnets are ordered from a 2026-07-20 DefiLlama activity snapshot (24h fees,
// with TVL as a fallback). Only the user's visible WalletChan networks enter
// discovery. Unknown future mainnets precede testnets.
export const SAFE_DISCOVERY_ACTIVITY_PRIORITY = [
  1, 8453, 42161, 10,
  137, 56, 43114, 4663, 57073, 9745, 143, 4326, 5000, 130, 747474,
  988, 43111, 59144, 146, 42220, 80094, 25363, 16661, 534352, 3338,
  4217, 1672, 1313161554, 232, 100, 480, 8217, 204, 5042, 3637, 677,
  81224, 102030, 999, 50, 196,
] as const;
const SAFE_DISCOVERY_PRIORITY_RANK = new Map<number, number>(
  SAFE_DISCOVERY_ACTIVITY_PRIORITY.map((chainId, index) => [chainId, index]),
);
const POPULAR_SAFE_DISCOVERY_CHAIN_COUNT = 4;

export interface SafeEligibleChain {
  chainId: number;
  name: string;
  rpcUrl?: string;
  shortName: string;
  isTestnet: boolean;
}

export interface SafeDiscoveryBatchResult {
  candidates: Array<{ address: SafeAddress; snapshot: SafeChainSnapshot }>;
  failures: SafeProbeFailure[];
  scannedChainIds: number[];
  nextOffset: number;
  totalChains: number;
  complete: boolean;
}

export interface ParsedSafeAddress {
  address: SafeAddress;
  requestedChainId?: number;
  requestedChainPrefix?: string;
}

export interface SafeProbeFailure {
  chainId: number;
  chainName: string;
  error: string;
}

export interface SafeProbeResult {
  address: SafeAddress;
  snapshots: SafeChainSnapshot[];
  failures: SafeProbeFailure[];
  scannedChainIds: number[];
}

const PREFIXES = new Map<string, number>([
  ["eth", 1],
  ["ethereum", 1],
  ["base", 8453],
  ["base-sepolia", BASE_SEPOLIA_CHAIN_ID],
  ["basesepolia", BASE_SEPOLIA_CHAIN_ID],
  ["matic", 137],
  ["polygon", 137],
  ["arb1", 42161],
  ["arbitrum", 42161],
  ["oeth", 10],
  ["optimism", 10],
  ["unichain", 130],
]);

PREFIXES.set(String(BASE_SEPOLIA_CHAIN_ID), BASE_SEPOLIA_CHAIN_ID);

function createSafeServiceRateGate() {
  let nextStart = 0;
  return async () => {
    const now = Date.now();
    const waitMs = Math.max(0, nextStart - now);
    nextStart = Math.max(now, nextStart) + SAFE_SERVICE_REQUEST_INTERVAL_MS;
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
  };
}

// Shared across manual scans, owner-discovery pages, and overlapping renderer
// requests so a new batch cannot reset the Safe gateway interval.
const waitForSafeServiceSlot = createSafeServiceRateGate();

export function parseSafeAddressInput(value: string): ParsedSafeAddress {
  const trimmed = value.trim();
  const separator = trimmed.indexOf(":");
  const prefix = separator >= 0 ? trimmed.slice(0, separator).toLowerCase() : null;
  const rawAddress = separator >= 0 ? trimmed.slice(separator + 1) : trimmed;
  if (!isAddress(rawAddress)) throw new Error("Enter a valid Safe address");
  const numericChainId = prefix && /^\d+$/.test(prefix) ? Number(prefix) : undefined;
  if (numericChainId !== undefined && (!Number.isSafeInteger(numericChainId) || numericChainId <= 0)) {
    throw new Error("Unsupported chain prefix");
  }
  const requestedChainId = prefix
    ? (PREFIXES.get(prefix) ?? numericChainId)
    : undefined;
  return {
    address: getAddress(rawAddress).toLowerCase() as SafeAddress,
    requestedChainId,
    ...(prefix && !requestedChainId ? { requestedChainPrefix: prefix } : {}),
  };
}

export async function getSafeEligibleChains(
  requestedChainId?: number,
  dependencies: {
    getServices?: typeof getSafeServiceChains;
    getNetworksInfo?: typeof getStoredNetworksInfo;
  } = {},
) {
  const [services, networksInfo] = await Promise.all([
    (dependencies.getServices ?? getSafeServiceChains)(),
    (dependencies.getNetworksInfo ?? getStoredNetworksInfo)(),
  ]);
  const visible = new Map(
    getVisibleChains(networksInfo).map((chain) => [chain.chainId, chain]),
  );
  const chains: SafeEligibleChain[] = services
    .filter((chain) =>
      visible.has(chain.chainId) &&
      (!requestedChainId || chain.chainId === requestedChainId),
    )
    .map((chain) => {
      const local = visible.get(chain.chainId)!;
      return {
        chainId: chain.chainId,
        name: local.name,
        shortName: chain.shortName,
        rpcUrl: local.rpcUrl || chain.publicRpcUrl,
        isTestnet: chain.isTestnet,
      };
    })
    .sort((a, b) => {
      const aRank = SAFE_DISCOVERY_PRIORITY_RANK.get(a.chainId);
      const bRank = SAFE_DISCOVERY_PRIORITY_RANK.get(b.chainId);
      const aPopular = aRank !== undefined && aRank < POPULAR_SAFE_DISCOVERY_CHAIN_COUNT;
      const bPopular = bRank !== undefined && bRank < POPULAR_SAFE_DISCOVERY_CHAIN_COUNT;
      if (aPopular !== bPopular) return aPopular ? -1 : 1;
      if (aPopular && bPopular) return aRank! - bRank!;

      if (a.isTestnet !== b.isTestnet) return a.isTestnet ? 1 : -1;
      return (aRank ?? Number.MAX_SAFE_INTEGER) -
        (bRank ?? Number.MAX_SAFE_INTEGER) || a.chainId - b.chainId;
    });
  if (requestedChainId && chains.length === 0) {
    if (services.some((chain) => chain.chainId === requestedChainId)) {
      throw new Error("Show this network in Settings before scanning for Safes");
    }
    throw new Error("Safe is not supported on that network");
  }
  return chains.slice(0, MAX_PROBE_CHAINS);
}

export async function probeSafeAddress(
  input: string,
  verify: typeof verifySafeOnchainState = verifySafeOnchainState,
  dependencies: {
    info?: typeof fetchSafeInfo;
    getServices?: typeof getSafeServiceChains;
    getNetworksInfo?: typeof getStoredNetworksInfo;
  } = {},
): Promise<SafeProbeResult> {
  const parsed = parseSafeAddressInput(input);
  let chains = await getSafeEligibleChains(parsed.requestedChainId, dependencies);
  if (parsed.requestedChainPrefix) {
    const normalized = parsed.requestedChainPrefix.replace(/[^a-z0-9]/g, "");
    chains = chains.filter((chain) =>
      chain.shortName === parsed.requestedChainPrefix ||
      chain.name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized,
    );
    if (chains.length !== 1) throw new Error("Unsupported chain prefix");
  }
  const info = dependencies.info ?? fetchSafeInfo;
  const snapshots: SafeChainSnapshot[] = [];
  const failures: SafeProbeFailure[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < chains.length) {
      const chain = chains[cursor++];
      try {
        await waitForSafeServiceSlot();
        await info(chain.chainId, parsed.address);
        snapshots.push(
          await verify({
            chainId: chain.chainId,
            safeAddress: parsed.address,
            ...(chain.rpcUrl ? { rpcUrl: chain.rpcUrl } : {}),
          }),
        );
      } catch (error) {
        if (error instanceof SafeServiceError && error.status === 404) continue;
        failures.push({
          chainId: chain.chainId,
          chainName: chain.name,
          error: error instanceof Error ? error.message : "Network unavailable",
        });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PROBE_CONCURRENCY, chains.length) }, () => worker()),
  );
  snapshots.sort((a, b) => a.chainId - b.chainId);
  failures.sort((a, b) => a.chainId - b.chainId);
  return {
    address: parsed.address,
    snapshots,
    failures,
    scannedChainIds: chains.map((chain) => chain.chainId),
  };
}

async function findSafesOwnedByAccountOnChains(
  account: Account,
  chains: SafeEligibleChain[],
  dependencies: {
    discover?: typeof discoverSafesByOwner;
    verify?: typeof verifySafeOnchainState;
  } = {},
) {
  const discover = dependencies.discover ?? discoverSafesByOwner;
  const verify = dependencies.verify ?? verifySafeOnchainState;
  assertDiscoverableOwnerAccount(account);
  const owner = account.address.toLowerCase() as SafeAddress;
  const pairs = chains.map((chain) => ({ chain, owner }));

  const discovered = new Map<string, {
    address: SafeAddress;
    chainId: number;
    chainName: string;
    rpcUrl?: string;
  }>();
  const failures: SafeProbeFailure[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < pairs.length) {
      const { chain, owner } = pairs[cursor++];
      try {
        await waitForSafeServiceSlot();
        const raw = await discover(chain.chainId, owner);
        const list = (raw as any)?.safes;
        if (!Array.isArray(list) || list.length > 100) throw new Error("Invalid Safe discovery response");
        for (const candidate of list) {
          if (typeof candidate !== "string" || !isAddress(candidate)) continue;
          const address = getAddress(candidate).toLowerCase() as SafeAddress;
          discovered.set(`${chain.chainId}:${address}`, {
            address,
            chainId: chain.chainId,
            chainName: chain.name,
            rpcUrl: chain.rpcUrl,
          });
        }
      } catch (error) {
        failures.push({ chainId: chain.chainId, chainName: chain.name, error: error instanceof Error ? error.message : "Safe service unavailable" });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, pairs.length) }, () => worker()));
  const verified = [];
  for (const candidate of [...discovered.values()].slice(0, 100)) {
    try {
      const snapshot = await verify({
        chainId: candidate.chainId,
        safeAddress: candidate.address,
        transactionService: "supported",
        ...(candidate.rpcUrl ? { rpcUrl: candidate.rpcUrl } : {}),
      });
      verified.push({ address: candidate.address, snapshot });
    } catch (error) {
      // Service discovery is never sufficient without onchain verification,
      // but preserve the verifier error so the import UI can explain a miss.
      failures.push({
        chainId: candidate.chainId,
        chainName: candidate.chainName,
        error: error instanceof Error ? error.message : "Safe verification failed",
      });
    }
  }
  return {
    candidates: verified,
    failures,
    scannedChainIds: chains.map((chain) => chain.chainId),
  };
}

function assertDiscoverableOwnerAccount(account: Account): void {
  if (!isSafeOwnerAccount(account)) {
    throw new Error("Select a signing account to find Safes");
  }
}

export async function findSafesOwnedByAccount(
  account: Account,
  dependencies: {
    discover?: typeof discoverSafesByOwner;
    verify?: typeof verifySafeOnchainState;
    getServices?: typeof getSafeServiceChains;
    getNetworksInfo?: typeof getStoredNetworksInfo;
  } = {},
) {
  assertDiscoverableOwnerAccount(account);
  const chains = await getSafeEligibleChains(undefined, dependencies);
  return findSafesOwnedByAccountOnChains(account, chains, dependencies);
}

export async function findSafesOwnedByAccountBatch(
  account: Account,
  page: { offset: number; limit: number },
  dependencies: {
    discover?: typeof discoverSafesByOwner;
    verify?: typeof verifySafeOnchainState;
    getServices?: typeof getSafeServiceChains;
    getNetworksInfo?: typeof getStoredNetworksInfo;
  } = {},
): Promise<SafeDiscoveryBatchResult> {
  assertDiscoverableOwnerAccount(account);
  const chains = await getSafeEligibleChains(undefined, dependencies);
  const batch = chains.slice(page.offset, page.offset + page.limit);
  const result = await findSafesOwnedByAccountOnChains(
    account,
    batch,
    dependencies,
  );
  const nextOffset = Math.min(page.offset + batch.length, chains.length);
  return {
    ...result,
    nextOffset,
    totalChains: chains.length,
    complete: nextOffset >= chains.length,
  };
}
