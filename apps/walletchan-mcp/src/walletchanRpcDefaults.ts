export const WALLETCHAN_BASE_RPC_URL = "https://base.drpc.org";

// Mirrored from apps/walletchan-rpc/src/chains.ts and apps/walletchan-rpc/README.md.
// Keep this list in sync when walletchan-rpc built-in default RPCs change.
export const WALLETCHAN_DEFAULT_RPC_URLS = [
  "https://eth.drpc.org",
  "https://arb1.arbitrum.io/rpc",
  WALLETCHAN_BASE_RPC_URL,
  "https://bsc-dataseed.binance.org",
  "https://mainnet.optimism.io",
  "https://mainnet.megaeth.com/rpc",
  "https://polygon.drpc.org",
  "https://mainnet.unichain.org",
  "https://gnosis.drpc.org",
  "https://monad.drpc.org",
  "https://sonic.drpc.org",
  "https://rpc.intuition.systems",
  "https://sei.drpc.org",
  "https://ronin.drpc.org",
  "https://rpc.citrea.xyz",
  "https://tempo.drpc.org",
  "https://mantle.drpc.org",
  "https://arbitrum-nova.drpc.org",
  "https://celo.drpc.org",
  "https://ink.drpc.org",
  "https://linea.drpc.org",
  "https://berachain.drpc.org",
  "https://katana.drpc.org",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  "https://sepolia.unichain.org",
  "https://evm-rpc-testnet.sei-apis.com",
  "https://rpc.sepolia.mantle.xyz",
  "https://rpc.testnet.citrea.xyz",
  "https://carrot.megaeth.com/rpc",
  "https://testnet-rpc.monad.xyz",
  "https://rpc.chiadochain.net",
  "https://testnet.rpc.intuition.systems",
  "https://rpc.testnet.soniclabs.com",
  "https://rpc.moderato.tempo.xyz",
  "https://rpc.sepolia.linea.build",
  "https://rpc-amoy.polygon.technology",
  "https://bepolia.rpc.berachain.com",
  "https://sepolia.base.org",
  "https://saigon-testnet.roninchain.com/rpc",
  "https://sepolia-rollup.arbitrum.io/rpc",
  "https://rpc.hoodi.ethpandaops.io",
  "https://rpc.bokuto.katanarpc.com",
  "https://rpc-gel-sepolia.inkonchain.com",
  "https://forno.celo-sepolia.celo-testnet.org",
  "https://11155111.rpc.thirdweb.com",
  "https://sepolia.optimism.io",
] as const;

export const WALLETCHAN_DEFAULT_RPC_HOSTS = uniqueHosts(WALLETCHAN_DEFAULT_RPC_URLS);

function uniqueHosts(urls: readonly string[]): string[] {
  const hosts = new Set<string>();
  for (const url of urls) {
    hosts.add(new URL(url).hostname.toLowerCase());
  }
  return Array.from(hosts).sort();
}
