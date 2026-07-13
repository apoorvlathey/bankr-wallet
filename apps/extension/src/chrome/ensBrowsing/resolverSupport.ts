import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  namehash,
  parseAbi,
  type Hex,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";

import { secureHttpTransport } from "../network/rpcClient";

export const RESOLVER_ABI = parseAbi([
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

export function getDirectClient(url: string): PublicClient {
  if (directClientCache && directClientCache.url === url) {
    return directClientCache.client;
  }
  const client = createPublicClient({
    chain: mainnet,
    transport: secureHttpTransport(url, { retryCount: 0, timeout: 8_000 }),
  });
  directClientCache = { url, client };
  return client;
}

export type ResolveOptions = {
  /** Reserved for the future Helios verified-state transport. */
  bypassHelios?: boolean;
};

function dnsEncodeName(name: string): Hex {
  let hex = "0x";
  for (const label of name.split(".")) {
    if (!label || label.length > 63) {
      throw new Error(`Invalid ENS label length in ${name}`);
    }
    hex += label.length.toString(16).padStart(2, "0");
    for (let index = 0; index < label.length; index += 1) {
      const code = label.charCodeAt(index);
      if (code > 0x7f) throw new Error(`Non-ASCII ENS label in ${name}`);
      hex += code.toString(16).padStart(2, "0");
    }
  }
  return `${hex}00` as Hex;
}

export async function readContenthashViaUniversalResolver(
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

export function describeResolverError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
