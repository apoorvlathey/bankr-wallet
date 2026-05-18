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

  // Tier 1: lightweight probe — we only want to confirm the contract
  // implements ERC-4804 so we can hand off to w3eth.io. The hosted gateway
  // does the heavy lifting (request() call, body serving) itself.
  try {
    await fetchErc4804(client, address, { probeOnly: true });
  } catch (e) {
    if (e instanceof Web3FetchError) {
      return { ok: false, error: `web3-${e.detail.kind}: ${e.message}` };
    }
    return { ok: false, error: `ERC-4804 probe failed: ${describe(e)}` };
  }

  // Routing-only result for Tier 1. The `value` here is the contract address
  // — Tier 2b will overwrite this with the IPFS CID once it pins the bytes
  // locally. The caller (gateway.ts → buildHostedGatewayUrl) only uses the
  // `kind` field for the w3eth.io routing decision.
  return {
    ok: true,
    kind: "web3",
    value: address.toLowerCase(),
    ensName: stripped,
    trustedDirectly,
    contractAddress: address.toLowerCase() as `0x${string}`,
  };
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
