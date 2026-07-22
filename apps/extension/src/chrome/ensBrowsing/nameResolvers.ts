import { decode as decodeContentHash, getCodec } from "@ensdomains/content-hash";
import { namehash } from "viem";

import { getStoredRpcUrl } from "@/lib/chains";
import { fetchPinAndCacheErc4804, resolveContractAddress } from "./erc4804Resolver";
import {
  RESOLVER_ABI,
  describeResolverError,
  getDirectClient,
  readContenthashViaUniversalResolver,
  type ResolveOptions,
} from "./resolverSupport";
import { getEnsBrowsingSettings } from "./settingsStorage";
import type { ResolveResponse } from "./types";
import { fetchErc4804, Web3FetchError } from "./web3url";

const GWEI_NAMENFT =
  "0x9D51D507BC7264d4fE8Ad1cf7Fe191933A0a81d6" as const;

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
  const client = getDirectClient(rpcUrl);
  const trustedDirectly = true;

  let raw: `0x${string}`;
  let contenthashReadError: string | null = null;
  try {
    raw = await readContenthashViaUniversalResolver(client, stripped);
  } catch (error) {
    raw = "0x";
    contenthashReadError = describeResolverError(error);
  }

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

  let address: `0x${string}` | null;
  try {
    address = await client.getEnsAddress({ name: stripped }) as
      | `0x${string}`
      | null;
  } catch (error) {
    const detail = describeResolverError(error);
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

  const settings = await getEnsBrowsingSettings();
  if (settings.pinOnchainHtml) {
    return fetchPinAndCacheErc4804(
      client,
      address.toLowerCase() as `0x${string}`,
      stripped,
      trustedDirectly,
    );
  }
  try {
    await fetchErc4804(client, address, { probeOnly: true });
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
    value: address.toLowerCase(),
    ensName: stripped,
    trustedDirectly,
    contractAddress: address.toLowerCase() as `0x${string}`,
  };
}

/** True for a fully-qualified `.gwei` name, including subdomains. */
export function isGweiName(name: string): boolean {
  return /^(?:[a-z0-9-]+\.)+gwei\.?$/.test(name.toLowerCase());
}

export async function resolveGwei(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts: ResolveOptions = {},
): Promise<ResolveResponse> {
  const lower = name.toLowerCase();
  if (!isGweiName(lower)) {
    return { ok: false, error: `Not a .gwei name: ${name}` };
  }
  const stripped = lower.endsWith(".") ? lower.slice(0, -1) : lower;
  const rpcUrl = await getStoredRpcUrl(1);
  if (!rpcUrl) {
    return {
      ok: false,
      error:
        "No Ethereum mainnet RPC configured. Open WalletChan -> Settings -> Chain RPCs to add one.",
      code: "no-mainnet-rpc",
    };
  }
  const client = getDirectClient(rpcUrl);
  const trustedDirectly = true;

  let raw: `0x${string}`;
  try {
    raw = await client.readContract({
      address: GWEI_NAMENFT,
      abi: RESOLVER_ABI,
      functionName: "contenthash",
      args: [namehash(stripped)],
    });
  } catch (error) {
    return {
      ok: false,
      error: `Failed to read contenthash for ${stripped}: ${describeResolverError(error)}`,
    };
  }
  if (!raw || raw === "0x") {
    return { ok: false, error: `${stripped} has no website contenthash set.` };
  }

  let codec: string | undefined;
  let decoded: string | undefined;
  try {
    codec = getCodec(raw);
    decoded = decodeContentHash(raw);
  } catch (error) {
    return {
      ok: false,
      error: `Failed to decode contenthash for ${stripped}: ${describeResolverError(error)}`,
    };
  }
  if (decoded != null && (codec === "ipfs" || codec === "ipns")) {
    return {
      ok: true,
      kind: codec,
      value: decoded,
      ensName: stripped,
      trustedDirectly,
    };
  }
  return {
    ok: false,
    error: `Unsupported contenthash codec "${codec ?? "unknown"}" for ${stripped}. .gwei sites serve ipfs / ipns.`,
  };
}
