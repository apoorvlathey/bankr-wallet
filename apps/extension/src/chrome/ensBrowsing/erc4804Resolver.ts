import type { PublicClient } from "viem";

import { getStoredRpcUrl } from "@/lib/chains";
import { addToKubo, KuboPinError, removeMfsPath, unpinFromKubo } from "./kubo";
import { describeResolverError, getDirectClient } from "./resolverSupport";
import { getEnsBrowsingSettings } from "./settingsStorage";
import type { ResolveResponse } from "./types";
import { fetchErc4804, Web3FetchError } from "./web3url";
import {
  bumpWeb3LastAccess,
  getWeb3Budgets,
  getWeb3CacheEntry,
  mfsPathFor,
  planEviction,
  removeWeb3CacheEntry,
  setWeb3CacheEntry,
  sha256Hex,
} from "./web3UrlCache";

export async function resolveContractAddress(
  address: string,
): Promise<ResolveResponse> {
  const lower = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    return { ok: false, error: `Not a contract address: ${address}` };
  }

  const rpcUrl = await getStoredRpcUrl(1);
  if (!rpcUrl) {
    return {
      ok: false,
      error:
        "No Ethereum mainnet RPC configured. Open WalletChan → Settings → Chain RPCs to add one.",
      code: "no-mainnet-rpc",
    };
  }
  const client = getDirectClient(rpcUrl);
  const settings = await getEnsBrowsingSettings();
  if (!settings.pinOnchainHtml) {
    try {
      await fetchErc4804(client, lower as `0x${string}`, { probeOnly: true });
    } catch (error) {
      if (error instanceof Web3FetchError) {
        return { ok: false, error: `web3-${error.detail.kind}: ${error.message}` };
      }
      return {
        ok: false,
        error: `ERC-4804 probe failed: ${describeResolverError(error)}`,
      };
    }
    return {
      ok: true,
      kind: "web3",
      value: lower,
      ensName: lower,
      trustedDirectly: true,
      contractAddress: lower as `0x${string}`,
    };
  }
  return fetchPinAndCacheErc4804(
    client,
    lower as `0x${string}`,
    lower,
    true,
  );
}

export async function fetchPinAndCacheErc4804(
  client: PublicClient,
  address: `0x${string}`,
  ensName: string,
  trustedDirectly: boolean,
): Promise<ResolveResponse> {
  let body: Uint8Array;
  let contentType: string | null;
  try {
    const fetched = await fetchErc4804(client, address);
    body = fetched.body;
    contentType = fetched.contentType;
  } catch (error) {
    if (error instanceof Web3FetchError) {
      return { ok: false, error: `web3-${error.detail.kind}: ${error.message}` };
    }
    return {
      ok: false,
      error: `ERC-4804 probe failed: ${describeResolverError(error)}`,
    };
  }

  if (contentType && !/^\s*text\/html(?:\s*;|\s*$)/i.test(contentType)) {
    return {
      ok: false,
      error: `web3-non-html: contract returned content-type "${contentType}" (only text/html supported).`,
    };
  }

  let contentHash: string;
  try {
    contentHash = await sha256Hex(body);
  } catch (error) {
    return {
      ok: false,
      error: `sha256 failed: ${describeResolverError(error)}`,
    };
  }

  const existing = await getWeb3CacheEntry(address).catch(() => null);
  if (existing && existing.contentHash === contentHash) {
    bumpWeb3LastAccess(address).catch(() => undefined);
    return {
      ok: true,
      kind: "web3",
      value: existing.cid,
      ensName,
      trustedDirectly,
      contractAddress: address,
    };
  }

  let cid: string;
  try {
    const budgets = await getWeb3Budgets();
    const plan = await planEviction(body.byteLength, budgets);
    for (const stale of plan.toEvict) {
      await evictWeb3(stale).catch((error) =>
        console.warn(`[ens] eviction failed for ${stale.contractAddress}`, error),
      );
    }
    if (existing && existing.cid !== "") {
      await evictWeb3(existing).catch((error) =>
        console.warn("[ens] swap eviction failed", error),
      );
    }
    const pinned = await addToKubo(body, {
      mfsPath: mfsPathFor(address, contentHash),
    });
    cid = pinned.cid;
  } catch (error) {
    if (error instanceof KuboPinError) {
      if (error.detail.kind === "cors") {
        return {
          ok: false,
          error: `web3-pin-failed: ${error.message}`,
          code: "kubo-cors-blocked",
        };
      }
      return { ok: false, error: `web3-pin-failed: ${error.message}` };
    }
    return {
      ok: false,
      error: `web3-pin-failed: ${describeResolverError(error)}`,
    };
  }

  await setWeb3CacheEntry({
    contractAddress: address,
    contentHash,
    cid,
    bodyLen: body.byteLength,
    lastAccess: Date.now(),
    ensName,
  }).catch((error) => console.warn("[ens] web3 cache write failed", error));
  return {
    ok: true,
    kind: "web3",
    value: cid,
    ensName,
    trustedDirectly,
    contractAddress: address,
  };
}

async function evictWeb3(entry: {
  contractAddress: `0x${string}`;
  contentHash: string;
  cid: string;
}): Promise<void> {
  await Promise.allSettled([
    unpinFromKubo(entry.cid),
    removeMfsPath(mfsPathFor(entry.contractAddress, entry.contentHash)),
  ]);
  await removeWeb3CacheEntry(entry.contractAddress).catch(() => undefined);
}
