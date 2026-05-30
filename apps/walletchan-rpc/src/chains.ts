export interface RuntimeChain {
  name: string;
  displayName: string;
  chainId: number;
  rpcUrl: string;
}

interface BuiltInChain extends RuntimeChain {
  aliases: string[];
}

const BUILTIN_CHAINS: BuiltInChain[] = [
  {
    name: "base",
    displayName: "Base",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    aliases: ["base-mainnet"],
  },
  {
    name: "ethereum",
    displayName: "Ethereum",
    chainId: 1,
    rpcUrl: "https://eth.llamarpc.com",
    aliases: ["eth", "mainnet"],
  },
  {
    name: "megaeth",
    displayName: "MegaETH",
    chainId: 4326,
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    aliases: ["mega"],
  },
  {
    name: "polygon",
    displayName: "Polygon",
    chainId: 137,
    rpcUrl: "https://polygon-rpc.com",
    aliases: ["matic"],
  },
  {
    name: "unichain",
    displayName: "Unichain",
    chainId: 130,
    rpcUrl: "https://mainnet.unichain.org",
    aliases: ["uni"],
  },
];

export function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function toCaip2(chainId: number): string {
  return `eip155:${chainId}`;
}

export function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  const parsed = trimmed.startsWith("0x")
    ? Number.parseInt(trimmed, 16)
    : Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function findBuiltInChain(value: string): BuiltInChain | null {
  const normalized = value.trim().toLowerCase();
  const chainId = parseChainId(normalized);
  return (
    BUILTIN_CHAINS.find((chain) => {
      return (
        chain.name === normalized ||
        chain.aliases.includes(normalized) ||
        chain.chainId === chainId
      );
    }) || null
  );
}

export function resolveChainInput(value: string): RuntimeChain {
  const builtIn = findBuiltInChain(value);
  if (builtIn) {
    const { aliases: _aliases, ...chain } = builtIn;
    return chain;
  }

  const chainId = parseChainId(value);
  if (!chainId) {
    throw new Error(`Unknown chain "${value}". Use a built-in name or numeric chain ID.`);
  }

  return {
    name: String(chainId),
    displayName: `Chain ${chainId}`,
    chainId,
    rpcUrl: "",
  };
}

function parseRpcOverride(value: string): { chain: RuntimeChain; rpcUrl: string } {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid --rpc value "${value}". Use chain=url, e.g. base=https://...`);
  }

  const key = value.slice(0, separator).trim();
  const rpcUrl = value.slice(separator + 1).trim();
  const parsedUrl = new URL(rpcUrl);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`RPC URL for ${key} must use http or https`);
  }

  return { chain: resolveChainInput(key), rpcUrl };
}

export function resolveRuntimeChains(
  chainInputs: string[],
  rpcInputs: string[],
): RuntimeChain[] {
  const selectedInputs = chainInputs.length > 0 ? chainInputs : ["base"];
  const chains = new Map<number, RuntimeChain>();

  for (const input of selectedInputs) {
    const chain = resolveChainInput(input);
    chains.set(chain.chainId, chain);
  }

  for (const input of rpcInputs) {
    const override = parseRpcOverride(input);
    const selected = chains.get(override.chain.chainId);
    if (!selected) {
      throw new Error(
        `RPC override ${override.chain.name}=... does not match a selected chain. Add --chain ${override.chain.name}.`,
      );
    }
    chains.set(override.chain.chainId, {
      ...selected,
      rpcUrl: override.rpcUrl,
    });
  }

  const resolved = Array.from(chains.values());
  for (const chain of resolved) {
    if (!chain.rpcUrl) {
      throw new Error(`Missing RPC URL for chain ${chain.name}. Add --rpc ${chain.name}=https://...`);
    }
  }
  return resolved;
}

export function getChainById(chains: RuntimeChain[], chainId: number): RuntimeChain | null {
  return chains.find((chain) => chain.chainId === chainId) || null;
}

export function formatChain(chain: RuntimeChain): string {
  return `${chain.name}(${chain.chainId})`;
}

export function formatChains(chains: RuntimeChain[]): string {
  return chains.map(formatChain).join(", ");
}
