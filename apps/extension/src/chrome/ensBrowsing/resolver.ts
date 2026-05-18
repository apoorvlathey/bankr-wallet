// ENS resolver — the core of Tier 1.
//
// Ported from dapp3's `src/lib/resolver.ts` with the Helios verified-state
// transport stripped out. Every read currently goes through a direct HTTP
// viem client against the user's configured Ethereum mainnet RPC. Wherever a
// Helios-verified transport would slot in, a `// TODO(helios)` marker
// documents the call site.
//
// For Tier 1 (hosted-gateway routing) we resolve the contenthash and, if
// missing, probe the resolved address for ERC-4804 support so we can route
// onchain HTML to w3eth.io. The full fetch-pin-cache flow is implemented in
// Tier 2b; this module only needs to differentiate the routing kind.

import {
  createPublicClient,
  http,
  namehash,
  parseAbi,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";
import { decode as decodeContentHash, getCodec } from "@ensdomains/content-hash";
import { getStoredRpcUrl } from "@/lib/chains";
import type { ResolveResponse } from "./types";
import { fetchErc4804, Web3FetchError } from "./web3url";
import {
  addToKubo,
  KuboPinError,
  removeMfsPath,
  unpinFromKubo,
} from "./kubo";
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
import { getEnsBrowsingSettings } from "./settingsStorage";

const RESOLVER_ABI = parseAbi([
  "function contenthash(bytes32 node) view returns (bytes)",
  "function addr(bytes32 node) view returns (address)",
]);

let directClientCache: { url: string; client: PublicClient } | null = null;

function getDirectClient(url: string): PublicClient {
  if (directClientCache && directClientCache.url === url) {
    return directClientCache.client;
  }
  const client = createPublicClient({
    chain: mainnet,
    transport: http(url, { retryCount: 0, timeout: 8_000 }),
  });
  directClientCache = { url, client };
  return client;
}

export type ResolveOptions = {
  // Reserved for the future Helios path. Currently a no-op — direct HTTP is
  // the only transport. Kept in the signature so callers can pre-plumb the
  // flag without API churn when Helios lands.
  bypassHelios?: boolean;
};

// TODO(helios): once Helios ships, this module gains a sibling `getHeliosClient()`
// returning `createPublicClient({ transport: custom(heliosEip1193Provider()) })`,
// and `resolveEns` / `resolveContractAddress` choose between getHeliosClient()
// and getDirectClient(rpcUrl) based on opts.bypassHelios + Helios sync state.

export async function resolveEns(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts: ResolveOptions = {},
): Promise<ResolveResponse> {
  const lower = name.toLowerCase();
  if (!/^(?:[a-z0-9-]+\.)+eth\.?$/.test(lower)) {
    return { ok: false, error: `Not a .eth name: ${name}` };
  }
  const stripped = lower.endsWith(".") ? lower.slice(0, -1) : lower;

  const rpcUrl = await getStoredRpcUrl(1);
  if (!rpcUrl) {
    return {
      ok: false,
      error:
        "No Ethereum mainnet RPC configured. Open WalletChan → Settings → Chain RPCs to add one.",
      code: "no-mainnet-rpc",
    };
  }

  // TODO(helios): wrap in Helios verified transport when available.
  const client = getDirectClient(rpcUrl);
  const trustedDirectly = true;

  let resolverAddress: `0x${string}`;
  try {
    resolverAddress = (await client.getEnsResolver({
      name: stripped,
    })) as `0x${string}`;
  } catch (e) {
    return {
      ok: false,
      error: `No ENS resolver for ${stripped}: ${describe(e)}`,
    };
  }

  let raw: `0x${string}`;
  try {
    raw = await client.readContract({
      address: resolverAddress,
      abi: RESOLVER_ABI,
      functionName: "contenthash",
      args: [namehash(stripped)],
    });
  } catch (e) {
    return {
      ok: false,
      error: `Failed to read contenthash for ${stripped}: ${describe(e)}`,
    };
  }

  // Contenthash branch: ipfs / ipns are the primary path. Decoded value is
  // already in the form Kubo's subdomain gateway expects (CIDv1 base32 for
  // IPFS, raw IPNS key for IPNS).
  let contenthashUsable = !!raw && raw !== "0x";
  let codec: string | undefined;
  let decoded: string | undefined;
  if (contenthashUsable) {
    try {
      codec = getCodec(raw);
      decoded = decodeContentHash(raw);
    } catch {
      contenthashUsable = false;
    }
  }
  if (
    contenthashUsable &&
    decoded != null &&
    (codec === "ipfs" || codec === "ipns")
  ) {
    return {
      ok: true,
      kind: codec,
      value: decoded,
      ensName: stripped,
      trustedDirectly,
    };
  }

  // ERC-4804 fallback: read addr() and probe for ERC-5219 / manual support.
  // In Tier 1 we only need to *detect* it so we can route to w3eth.io; the
  // full fetch-pin-cache flow lives in Tier 2b's extended branch.
  let address: `0x${string}`;
  try {
    address = (await client.readContract({
      address: resolverAddress,
      abi: RESOLVER_ABI,
      functionName: "addr",
      args: [namehash(stripped)],
    })) as `0x${string}`;
  } catch (e) {
    const detail = describe(e);
    return {
      ok: false,
      error: contenthashUsable
        ? `Unsupported contenthash codec "${codec}" and addr() failed: ${detail}`
        : `${stripped} has no contenthash and addr() failed: ${detail}`,
    };
  }

  if (!address || /^0x0+$/i.test(address)) {
    return {
      ok: false,
      error: contenthashUsable
        ? `Unsupported contenthash codec "${codec}". Supported: ipfs, ipns, ERC-4804.`
        : `${stripped} has no contenthash and no addr record set.`,
    };
  }

  // Tier 2b ON → fetch-pin-cache flow returns an IPFS CID (served via local
  // Kubo subdomain). Tier 2b OFF → lightweight probe only; the `value` is
  // the contract address and the caller routes to w3eth.io.
  const settings = await getEnsBrowsingSettings();
  if (settings.tier2bKubo) {
    return await fetchPinAndCacheErc4804(
      client,
      address.toLowerCase() as `0x${string}`,
      stripped,
      trustedDirectly,
    );
  }

  try {
    await fetchErc4804(client, address, { probeOnly: true });
  } catch (e) {
    if (e instanceof Web3FetchError) {
      return { ok: false, error: `web3-${e.detail.kind}: ${e.message}` };
    }
    return { ok: false, error: `ERC-4804 probe failed: ${describe(e)}` };
  }
  return {
    ok: true,
    kind: "web3",
    value: address.toLowerCase(),
    ensName: stripped,
    trustedDirectly,
    contractAddress: address.toLowerCase() as `0x${string}`,
  };
}

// Tier 2b: fetch the contract HTML via viem, sha256-dedupe against the
// per-contract cache, pin to local Kubo if changed, evict LRU entries to
// fit budget. The returned `value` is the CID (served from
// <cid>.ipfs.localhost:8080 alongside ordinary IPFS contenthashes).
//
// Ported from dapp3 `src/lib/resolver.ts` `fetchPinAndCacheErc4804`.
async function fetchPinAndCacheErc4804(
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
  } catch (e) {
    if (e instanceof Web3FetchError) {
      return { ok: false, error: `web3-${e.detail.kind}: ${e.message}` };
    }
    return { ok: false, error: `ERC-4804 probe failed: ${describe(e)}` };
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
  } catch (e) {
    return { ok: false, error: `sha256 failed: ${describe(e)}` };
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
      await evictWeb3(stale).catch((e) =>
        console.warn(`[ens] eviction failed for ${stale.contractAddress}`, e),
      );
    }
    if (existing && existing.cid !== "") {
      await evictWeb3(existing).catch((e) =>
        console.warn("[ens] swap eviction failed", e),
      );
    }
    const pinned = await addToKubo(body, {
      mfsPath: mfsPathFor(address, contentHash),
    });
    cid = pinned.cid;
  } catch (e) {
    if (e instanceof KuboPinError) {
      if (e.detail.kind === "cors") {
        return {
          ok: false,
          error: `web3-pin-failed: ${e.message}`,
          code: "kubo-cors-blocked",
        };
      }
      return { ok: false, error: `web3-pin-failed: ${e.message}` };
    }
    return { ok: false, error: `web3-pin-failed: ${describe(e)}` };
  }

  await setWeb3CacheEntry({
    contractAddress: address,
    contentHash,
    cid,
    bodyLen: body.byteLength,
    lastAccess: Date.now(),
    ensName,
  }).catch((e) => console.warn("[ens] web3 cache write failed", e));

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
}) {
  await Promise.allSettled([
    unpinFromKubo(entry.cid),
    removeMfsPath(mfsPathFor(entry.contractAddress, entry.contentHash)),
  ]);
  await removeWeb3CacheEntry(entry.contractAddress).catch(() => undefined);
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
