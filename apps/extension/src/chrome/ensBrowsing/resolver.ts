// ENS resolver — the core of the hosted-gateway routing path.
//
// Ported from dapp3's `src/lib/resolver.ts` with the Helios verified-state
// transport stripped out. Every read currently goes through a direct HTTP
// viem client against the user's configured Ethereum mainnet RPC. Wherever a
// Helios-verified transport would slot in, a `// TODO(helios)` marker
// documents the call site.
//
// We resolve the contenthash and, if missing, probe the resolved address for
// ERC-4804 support so we can route onchain HTML to w3eth.io. The full
// fetch-pin-cache flow (only used when `pinOnchainHtml` is ON) extends this
// with a Kubo write step; the rest of this module only needs to differentiate
// the routing kind.

import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  http,
  namehash,
  parseAbi,
  type Hex,
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

const UNIVERSAL_RESOLVER_ABI = parseAbi([
  "function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result, address resolver)",
]);

const ENS_UNIVERSAL_RESOLVER_ADDRESS =
  mainnet.contracts.ensUniversalResolver.address;
const LOCAL_BATCH_GATEWAY_URL = "x-batch-gateway:true";

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

function dnsEncodeName(name: string): Hex {
  let hex = "0x";
  for (const label of name.split(".")) {
    if (!label || label.length > 63) {
      throw new Error(`Invalid ENS label length in ${name}`);
    }
    hex += label.length.toString(16).padStart(2, "0");
    for (let i = 0; i < label.length; i += 1) {
      const code = label.charCodeAt(i);
      if (code > 0x7f) {
        throw new Error(`Non-ASCII ENS label in ${name}`);
      }
      hex += code.toString(16).padStart(2, "0");
    }
  }
  return `${hex}00` as Hex;
}

async function readContenthashViaUniversalResolver(
  client: PublicClient,
  name: string,
): Promise<Hex> {
  const node = namehash(name);
  const data = encodeFunctionData({
    abi: RESOLVER_ABI,
    functionName: "contenthash",
    args: [node],
  });
  const [result] = await client.readContract({
    address: ENS_UNIVERSAL_RESOLVER_ADDRESS,
    abi: UNIVERSAL_RESOLVER_ABI,
    functionName: "resolveWithGateways",
    args: [dnsEncodeName(name), data, [LOCAL_BATCH_GATEWAY_URL]],
  });

  if (!result || result === "0x") return "0x";
  return decodeFunctionResult({
    abi: RESOLVER_ABI,
    functionName: "contenthash",
    args: [node],
    data: result,
  }) as Hex;
}

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

  // Raw-address mode: the W3ETH_REGEX DNR rule rewrites
  // `0x<addr>.w3eth.io` rewrites to `http://0x<addr>.eth`; the w3link
  // interstitial path normalizes `0x<addr>.1.w3link.io` to the same
  // `0x<addr>.eth` shape. Skip ENS lookup and resolve as an ERC-4804 contract.
  const labelOnly = stripped.slice(0, -4);
  if (/^0x[a-f0-9]{40}$/.test(labelOnly)) {
    return resolveContractAddress(labelOnly);
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

  // TODO(helios): wrap in Helios verified transport when available.
  const client = getDirectClient(rpcUrl);
  const trustedDirectly = true;

  let raw: `0x${string}`;
  let contenthashReadError: string | null = null;
  try {
    raw = await readContenthashViaUniversalResolver(client, stripped);
  } catch (e) {
    raw = "0x";
    contenthashReadError = describe(e);
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
  // The hosted-gateway path only needs to *detect* support so it can route
  // to w3eth.io; the full fetch-pin-cache flow lives in the branch below
  // gated on `pinOnchainHtml`.
  let address: `0x${string}` | null;
  try {
    address = await client.getEnsAddress({ name: stripped });
  } catch (e) {
    const detail = describe(e);
    return {
      ok: false,
      error: contenthashUsable
        ? `Unsupported contenthash codec "${codec}" and addr() failed: ${detail}`
        : contenthashReadError
          ? `Failed to read contenthash for ${stripped}: ${contenthashReadError}; addr() also failed: ${detail}`
          : `${stripped} has no contenthash and addr() failed: ${detail}`,
    };
  }

  if (!address || /^0x0+$/i.test(address)) {
    return {
      ok: false,
      error: contenthashUsable
        ? `Unsupported contenthash codec "${codec}". Supported: ipfs, ipns, ERC-4804.`
        : contenthashReadError
          ? `Failed to read contenthash for ${stripped}: ${contenthashReadError}; no addr record set.`
          : `${stripped} has no contenthash and no addr record set.`,
    };
  }

  // pinOnchainHtml ON → fetch-pin-cache flow returns an IPFS CID (served via
  // local Kubo subdomain). OFF → lightweight probe only; the `value` is the
  // contract address and the caller routes to w3eth.io.
  const settings = await getEnsBrowsingSettings();
  if (settings.pinOnchainHtml) {
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

// Resolve a raw 0x contract address as an ERC-4804 dapp, skipping ENS lookup.
// Reached via either:
//   - `0x<addr>.w3eth.io` interception, where the W3ETH_REGEX rewrite produces
//     `http://0x<addr>.eth`, or
//   - `0x<addr>.1.w3link.io` interception, where the interstitial normalizes
//     the mainnet w3link URL to the same raw-address `.eth` shape, or
//   - the manual dapp3 launcher, which opens interstitial.html directly.
//
// The `ensName` field on the response is the lowercased address itself, since
// there is no associated ENS name. When pinOnchainHtml is OFF, we only probe
// ERC-4804 support and then route to hosted w3eth.io. When pinOnchainHtml is
// ON, we fetch + pin the HTML body to local Kubo.
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

  // TODO(helios): wrap in Helios verified transport when available.
  const client = getDirectClient(rpcUrl);

  const settings = await getEnsBrowsingSettings();
  if (!settings.pinOnchainHtml) {
    try {
      await fetchErc4804(client, lower as `0x${string}`, { probeOnly: true });
    } catch (e) {
      if (e instanceof Web3FetchError) {
        return { ok: false, error: `web3-${e.detail.kind}: ${e.message}` };
      }
      return { ok: false, error: `ERC-4804 probe failed: ${describe(e)}` };
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

  return await fetchPinAndCacheErc4804(
    client,
    lower as `0x${string}`,
    lower,
    true,
  );
}

// pinOnchainHtml path: fetch the contract HTML via viem, sha256-dedupe against the
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
