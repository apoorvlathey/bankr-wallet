export interface RuntimeChain {
  name: string;
  displayName: string;
  chainId: number;
  rpcUrl: string;
}

interface BuiltInChain extends RuntimeChain {
  aliases: string[];
}

function chain(
  name: string,
  displayName: string,
  chainId: number,
  rpcUrl: string,
  aliases: string[] = [],
): BuiltInChain {
  return { name, displayName, chainId, rpcUrl, aliases };
}

const BUILTIN_CHAINS: BuiltInChain[] = [
  // WalletChan extension default networks.
  chain("ethereum", "Ethereum", 1, "https://eth.drpc.org", ["eth", "mainnet"]),
  chain("arbitrum", "Arbitrum", 42161, "https://arb1.arbitrum.io/rpc", [
    "arb",
    "arbitrum-one",
  ]),
  chain("base", "Base", 8453, "https://base.drpc.org", ["base-mainnet"]),
  chain("bnb", "BNB Chain", 56, "https://bsc-dataseed.binance.org", [
    "bsc",
    "bnb-chain",
    "binance",
    "binance-smart-chain",
  ]),
  chain("optimism", "Optimism", 10, "https://mainnet.optimism.io", [
    "op",
    "optimistic-ethereum",
  ]),
  chain("megaeth", "MegaETH", 4326, "https://mainnet.megaeth.com/rpc", ["mega"]),
  chain("polygon", "Polygon", 137, "https://polygon.drpc.org", [
    "matic",
    "polygon-pos",
  ]),
  chain("unichain", "Unichain", 130, "https://mainnet.unichain.org", ["uni"]),

  // WalletChan known-chain registry entries with default RPC metadata.
  chain("gnosis", "Gnosis", 100, "https://gnosis.drpc.org", ["xdai"]),
  chain("monad", "Monad", 143, "https://monad.drpc.org"),
  chain("sonic", "Sonic", 146, "https://sonic.drpc.org"),
  chain("intuition", "Intuition", 1155, "https://rpc.intuition.systems"),
  chain("sei", "Sei Network", 1329, "https://sei.drpc.org", ["sei-network"]),
  chain("ronin", "Ronin", 2020, "https://ronin.drpc.org"),
  chain("citrea", "Citrea", 4114, "https://rpc.citrea.xyz"),
  chain("tempo", "Tempo", 4217, "https://tempo.drpc.org"),
  chain("mantle", "Mantle", 5000, "https://mantle.drpc.org"),
  chain("arbitrum-nova", "Arbitrum Nova", 42170, "https://arbitrum-nova.drpc.org", [
    "arb-nova",
    "nova",
  ]),
  chain("celo", "Celo", 42220, "https://celo.drpc.org"),
  chain("ink", "Ink", 57073, "https://ink.drpc.org"),
  chain("linea", "Linea Mainnet", 59144, "https://linea.drpc.org", [
    "linea-mainnet",
  ]),
  chain("berachain", "Berachain", 80094, "https://berachain.drpc.org", [
    "bera",
  ]),
  chain("katana", "Katana", 747474, "https://katana.drpc.org"),

  // WalletChan known-chain testnets.
  chain("bnb-testnet", "BNB Smart Chain Testnet", 97, "https://data-seed-prebsc-1-s1.bnbchain.org:8545", [
    "bsc-testnet",
    "binance-testnet",
  ]),
  chain("unichain-sepolia", "Unichain Sepolia", 1301, "https://sepolia.unichain.org", [
    "uni-sepolia",
  ]),
  chain("sei-testnet", "Sei Testnet", 1328, "https://evm-rpc-testnet.sei-apis.com"),
  chain("mantle-sepolia", "Mantle Sepolia Testnet", 5003, "https://rpc.sepolia.mantle.xyz"),
  chain("citrea-testnet", "Citrea Testnet", 5115, "https://rpc.testnet.citrea.xyz"),
  chain("megaeth-testnet", "MegaETH Testnet", 6343, "https://carrot.megaeth.com/rpc", [
    "mega-testnet",
  ]),
  chain("monad-testnet", "Monad Testnet", 10143, "https://testnet-rpc.monad.xyz"),
  chain("gnosis-chiado", "Gnosis Chiado", 10200, "https://rpc.chiadochain.net", [
    "chiado",
  ]),
  chain("intuition-testnet", "Intuition Testnet", 13579, "https://testnet.rpc.intuition.systems"),
  chain("sonic-testnet", "Sonic Testnet", 14601, "https://rpc.testnet.soniclabs.com"),
  chain("tempo-testnet", "Tempo Testnet (Moderato)", 42431, "https://rpc.moderato.tempo.xyz", [
    "moderato",
    "tempo-moderato",
  ]),
  chain("linea-sepolia", "Linea Sepolia Testnet", 59141, "https://rpc.sepolia.linea.build"),
  chain("polygon-amoy", "Polygon Amoy", 80002, "https://rpc-amoy.polygon.technology", [
    "amoy",
  ]),
  chain("berachain-bepolia", "Berachain Bepolia", 80069, "https://bepolia.rpc.berachain.com", [
    "bepolia",
    "bera-bepolia",
  ]),
  chain("base-sepolia", "Base Sepolia", 84532, "https://sepolia.base.org"),
  chain("ronin-saigon", "Ronin Saigon", 202601, "https://saigon-testnet.roninchain.com/rpc", [
    "saigon",
  ]),
  chain("arbitrum-sepolia", "Arbitrum Sepolia", 421614, "https://sepolia-rollup.arbitrum.io/rpc", [
    "arb-sepolia",
  ]),
  chain("hoodi", "Hoodi", 560048, "https://rpc.hoodi.ethpandaops.io"),
  chain("katana-bokuto", "Katana Bokuto", 737373, "https://rpc.bokuto.katanarpc.com", [
    "bokuto",
  ]),
  chain("ink-sepolia", "Ink Sepolia", 763373, "https://rpc-gel-sepolia.inkonchain.com"),
  chain("celo-sepolia", "Celo Sepolia Testnet", 11142220, "https://forno.celo-sepolia.celo-testnet.org"),
  chain("sepolia", "Sepolia", 11155111, "https://11155111.rpc.thirdweb.com", [
    "ethereum-sepolia",
    "eth-sepolia",
  ]),
  chain("optimism-sepolia", "OP Sepolia", 11155420, "https://sepolia.optimism.io", [
    "op-sepolia",
  ]),
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
