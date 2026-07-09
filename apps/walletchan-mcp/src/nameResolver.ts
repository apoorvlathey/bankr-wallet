import {
  createPublicClient,
  http,
  namehash,
  type Address,
  type Chain,
} from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";
import { resolveChainInput } from "./chains.js";

const ETHEREUM_CHAIN_ID = 1;
const MEGAETH_CHAIN_ID = 4326;

const DEFAULT_RPC_URLS: Record<number, string> = {
  [ETHEREUM_CHAIN_ID]: "https://eth.drpc.org",
  [MEGAETH_CHAIN_ID]: "https://mainnet.megaeth.com/rpc",
};

const WNS_CONTRACT = "0x0000000000696760E15f265e828DB644A0c242EB";
const GNS_CONTRACT = "0x9D51D507BC7264d4fE8Ad1cf7Fe191933A0a81d6";
const MEGA_NAMES_CONTRACT = "0x5B424C6CCba77b32b9625a6fd5A30D409d20d997";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const WNS_SELECTOR = {
  computeId: "0xfb021939",
  resolve: "0x4f896d4f",
};

const MEGA_NAMES_ABI = [
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "addr",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export type NameResolutionService = "ens" | "wns" | "gns" | "meganames";

export interface NameResolutionResult {
  input: string;
  normalizedName: string | null;
  address: Address | null;
  resolved: boolean;
  service: NameResolutionService | null;
  chainId: number | null;
  rpcSource: "override" | "default" | null;
  error?: string;
}

interface RpcTarget {
  url: string;
  source: "override" | "default";
}

export class NameResolver {
  private readonly rpcOverrides = new Map<number, string>();

  constructor(rpcOverrides: string[]) {
    for (const override of rpcOverrides) {
      const parsed = parseRpcOverride(override);
      if (parsed) this.rpcOverrides.set(parsed.chainId, parsed.rpcUrl);
    }
  }

  async resolveName(input: string): Promise<NameResolutionResult> {
    const name = input.trim();
    if (!name) throw new Error("resolve_name requires a non-empty name");
    if (/^0x[a-fA-F0-9]{40}$/.test(name)) {
      return {
        input,
        normalizedName: null,
        address: name as Address,
        resolved: true,
        service: null,
        chainId: null,
        rpcSource: null,
      };
    }
    if (!isResolvableName(name)) {
      return unresolved(input, null, null, null, "Input is not a supported WalletChan name");
    }

    try {
      if (isWnsName(name)) {
        return await this.resolveWnsName(input, name, "wns", ".wei");
      }
      if (isGnsName(name)) {
        return await this.resolveWnsName(input, name, "gns", ".gwei");
      }
      if (isMegaName(name)) {
        return await this.resolveMegaName(input, name);
      }
      return await this.resolveEnsName(input, name);
    } catch (error) {
      return unresolved(
        input,
        inferService(name),
        inferChainId(name),
        inferRpcSource(name, this.rpcOverrides),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async resolveEnsName(input: string, name: string): Promise<NameResolutionResult> {
    let normalizedName: string;
    try {
      normalizedName = normalize(name);
    } catch {
      return unresolved(input, "ens", ETHEREUM_CHAIN_ID, this.getRpcTarget(ETHEREUM_CHAIN_ID).source, "Invalid ENS name");
    }

    const rpc = this.getRpcTarget(ETHEREUM_CHAIN_ID);
    const client = createPublicClient({
      chain: mainnet,
      transport: http(rpc.url),
    });
    const address = await client.getEnsAddress({ name: normalizedName });
    return {
      input,
      normalizedName,
      address,
      resolved: Boolean(address),
      service: "ens",
      chainId: ETHEREUM_CHAIN_ID,
      rpcSource: rpc.source,
    };
  }

  private async resolveWnsName(
    input: string,
    name: string,
    service: "wns" | "gns",
    suffix: ".wei" | ".gwei",
  ): Promise<NameResolutionResult> {
    const normalizedName = name.toLowerCase();
    const rpc = this.getRpcTarget(ETHEREUM_CHAIN_ID);
    const contract = suffix === ".wei" ? WNS_CONTRACT : GNS_CONTRACT;
    const idResult = await ethCall(
      rpc.url,
      contract,
      WNS_SELECTOR.computeId + encodeString(normalizedName).slice(2),
    );
    const tokenId = decodeUint256(idResult);
    if (tokenId === 0n) {
      return unresolved(input, service, ETHEREUM_CHAIN_ID, rpc.source);
    }

    const resolveResult = await ethCall(
      rpc.url,
      contract,
      WNS_SELECTOR.resolve + encodeUint256(tokenId),
    );
    const address = decodeAddress(resolveResult);
    return {
      input,
      normalizedName,
      address,
      resolved: Boolean(address),
      service,
      chainId: ETHEREUM_CHAIN_ID,
      rpcSource: rpc.source,
    };
  }

  private async resolveMegaName(input: string, name: string): Promise<NameResolutionResult> {
    const normalizedName = name.toLowerCase();
    const rpc = this.getRpcTarget(MEGAETH_CHAIN_ID);
    const client = createPublicClient({
      chain: megaethChain(rpc.url),
      transport: http(rpc.url),
    });
    const tokenId = BigInt(namehash(normalizedName));

    try {
      const owner = await client.readContract({
        abi: MEGA_NAMES_ABI,
        address: MEGA_NAMES_CONTRACT,
        functionName: "ownerOf",
        args: [tokenId],
      });
      if (owner && owner.toLowerCase() !== ZERO_ADDRESS) {
        return resolved(input, normalizedName, owner as Address, "meganames", MEGAETH_CHAIN_ID, rpc.source);
      }
    } catch {
      // Token may not exist or may rely on explicit addr().
    }

    const address = await client.readContract({
      abi: MEGA_NAMES_ABI,
      address: MEGA_NAMES_CONTRACT,
      functionName: "addr",
      args: [tokenId],
    });
    if (!address || address.toLowerCase() === ZERO_ADDRESS) {
      return unresolved(input, "meganames", MEGAETH_CHAIN_ID, rpc.source);
    }
    return resolved(input, normalizedName, address as Address, "meganames", MEGAETH_CHAIN_ID, rpc.source);
  }

  private getRpcTarget(chainId: number): RpcTarget {
    const override = this.rpcOverrides.get(chainId);
    if (override) return { url: override, source: "override" };
    const fallback = DEFAULT_RPC_URLS[chainId];
    if (!fallback) throw new Error(`No RPC URL available for chain ${chainId}`);
    return { url: fallback, source: "default" };
  }
}

function isResolvableName(value: string): boolean {
  return value.includes(".") && !value.toLowerCase().startsWith("0x");
}

function isWnsName(value: string): boolean {
  return value.toLowerCase().endsWith(".wei");
}

function isGnsName(value: string): boolean {
  return value.toLowerCase().endsWith(".gwei");
}

function isMegaName(value: string): boolean {
  return value.toLowerCase().endsWith(".mega");
}

function inferService(name: string): NameResolutionService | null {
  if (isWnsName(name)) return "wns";
  if (isGnsName(name)) return "gns";
  if (isMegaName(name)) return "meganames";
  if (isResolvableName(name)) return "ens";
  return null;
}

function inferChainId(name: string): number | null {
  return isMegaName(name) ? MEGAETH_CHAIN_ID : isResolvableName(name) ? ETHEREUM_CHAIN_ID : null;
}

function inferRpcSource(
  name: string,
  overrides: Map<number, string>,
): "override" | "default" | null {
  const chainId = inferChainId(name);
  if (!chainId) return null;
  return overrides.has(chainId) ? "override" : "default";
}

function resolved(
  input: string,
  normalizedName: string,
  address: Address,
  service: NameResolutionService,
  chainId: number,
  rpcSource: "override" | "default",
): NameResolutionResult {
  return {
    input,
    normalizedName,
    address,
    resolved: true,
    service,
    chainId,
    rpcSource,
  };
}

function unresolved(
  input: string,
  service: NameResolutionService | null,
  chainId: number | null,
  rpcSource: "override" | "default" | null,
  error?: string,
): NameResolutionResult {
  return {
    input,
    normalizedName: null,
    address: null,
    resolved: false,
    service,
    chainId,
    rpcSource,
    ...(error ? { error } : {}),
  };
}

function parseRpcOverride(value: string): { chainId: number; rpcUrl: string } | null {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) return null;
  const chain = value.slice(0, separator).trim();
  const rpcUrl = value.slice(separator + 1).trim();
  if (!rpcUrl) return null;
  const parsedUrl = new URL(rpcUrl);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return null;
  const chainId = resolveChainInput(chain).chainId;
  return chainId ? { chainId, rpcUrl: parsedUrl.toString().replace(/\/$/, "") } : null;
}

async function ethCall(rpcUrl: string, contract: string, data: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: contract, data }, "latest"],
      }),
      signal: controller.signal,
    });
    const json = await res.json() as { result?: unknown; error?: { message?: string } };
    if (json.error) throw new Error(json.error.message || "RPC eth_call failed");
    return typeof json.result === "string" ? json.result : "0x";
  } finally {
    clearTimeout(timeout);
  }
}

function encodeString(str: string): string {
  const utf8 = new TextEncoder().encode(str);
  const padded = Math.ceil(utf8.length / 32) * 32;
  const data = new Uint8Array(padded);
  data.set(utf8);
  return `0x${encodeUint256(32n)}${encodeUint256(BigInt(utf8.length))}${bytesToHex(data).slice(2)}`;
}

function encodeUint256(value: bigint | number): string {
  return BigInt(value).toString(16).padStart(64, "0");
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function decodeUint256(hex: string | null): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex.slice(0, 66));
}

function decodeAddress(hex: string | null): Address | null {
  if (!hex || hex === "0x" || hex.length < 66) return null;
  const address = `0x${hex.slice(-40)}` as Address;
  return address.toLowerCase() === ZERO_ADDRESS ? null : address;
}

function megaethChain(rpcUrl: string): Chain {
  return {
    id: MEGAETH_CHAIN_ID,
    name: "MegaETH",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
}
