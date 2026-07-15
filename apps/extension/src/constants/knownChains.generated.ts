// AUTO-GENERATED — DO NOT EDIT. Run `pnpm regen-chains` to regenerate.
//
// Source: @metamask/delegation-deployments v1.3.0 deployment list.
// Every chainId here has the MM EIP7702StatelessDeleGator deployed at
// EIP_7702_DEFAULT_DELEGATE — so custom-chain users whose chainId matches
// an entry below get atomic 7702 batching by default (no manual delegate
// configuration required).

export interface KnownChainMetadata {
  chainId: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  defaultRpc: string;
  explorer: string;
  isTestnet: boolean;
  /**
   * Local SVG path ("/chainIcons/...") or external icon URL. Consumed by
   * `resolveChainIconMeta` after the built-in registry + named-alias
   * lookups. Absent on chains we don't yet have an icon source for —
   * those fall through to the deterministic-initials placeholder.
   */
  icon?: string;
}

export const KNOWN_CHAINS: Record<number, KnownChainMetadata> = {
  // ---------- Mainnets ----------
  100: {
    chainId: 100,
    name: "Gnosis",
    nativeCurrency: { name: "xDAI", symbol: "XDAI", decimals: 18 },
    defaultRpc: "https://gnosis.drpc.org",
    explorer: "https://gnosisscan.io",
    isTestnet: false,
    icon: "/chainIcons/gnosis.svg",
  },
  143: {
    chainId: 143,
    name: "Monad",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    defaultRpc: "https://monad.drpc.org",
    explorer: "https://monadvision.com",
    isTestnet: false,
    icon: "/chainIcons/monad.svg",
  },
  146: {
    chainId: 146,
    name: "Sonic",
    nativeCurrency: { name: "Sonic", symbol: "S", decimals: 18 },
    defaultRpc: "https://sonic.drpc.org",
    explorer: "https://sonicscan.org",
    isTestnet: false,
    icon: "/chainIcons/sonic.webp",
  },
  1155: {
    chainId: 1155,
    name: "Intuition",
    nativeCurrency: { name: "TRUST", symbol: "TRUST", decimals: 18 },
    defaultRpc: "https://rpc.intuition.systems",
    explorer: "https://explorer.intuition.systems",
    isTestnet: false,
  },
  1329: {
    chainId: 1329,
    name: "Sei Network",
    nativeCurrency: { name: "Sei", symbol: "SEI", decimals: 18 },
    defaultRpc: "https://sei.drpc.org",
    explorer: "https://seitrace.com",
    isTestnet: false,
    icon: "/chainIcons/sei.webp",
  },
  2020: {
    chainId: 2020,
    name: "Ronin",
    nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
    defaultRpc: "https://ronin.drpc.org",
    explorer: "https://app.roninchain.com",
    isTestnet: false,
    icon: "/chainIcons/ronin.webp",
  },
  4114: {
    chainId: 4114,
    name: "Citrea",
    nativeCurrency: { name: "cBTC", symbol: "cBTC", decimals: 18 },
    defaultRpc: "https://rpc.citrea.xyz",
    explorer: "https://explorer.citrea.xyz",
    isTestnet: false,
    icon: "/chainIcons/citrea.webp",
  },
  5000: {
    chainId: 5000,
    name: "Mantle",
    nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
    defaultRpc: "https://mantle.drpc.org",
    explorer: "https://mantlescan.xyz/",
    isTestnet: false,
    icon: "/chainIcons/mantle.svg",
  },
  42170: {
    chainId: 42170,
    name: "Arbitrum Nova",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://arbitrum-nova.drpc.org",
    explorer: "https://nova.arbiscan.io",
    isTestnet: false,
    icon: "/chainIcons/arbitrum-nova.webp",
  },
  42220: {
    chainId: 42220,
    name: "Celo",
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    defaultRpc: "https://celo.drpc.org",
    explorer: "https://celoscan.io",
    isTestnet: false,
    icon: "/chainIcons/celo.svg",
  },
  57073: {
    chainId: 57073,
    name: "Ink",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://ink.drpc.org",
    explorer: "https://explorer.inkonchain.com",
    isTestnet: false,
    icon: "/chainIcons/ink.svg",
  },
  59144: {
    chainId: 59144,
    name: "Linea Mainnet",
    nativeCurrency: { name: "Linea Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://linea.drpc.org",
    explorer: "https://lineascan.build",
    isTestnet: false,
    icon: "/chainIcons/linea.svg",
  },
  80094: {
    chainId: 80094,
    name: "Berachain",
    nativeCurrency: { name: "BERA Token", symbol: "BERA", decimals: 18 },
    defaultRpc: "https://berachain.drpc.org",
    explorer: "https://berascan.com",
    isTestnet: false,
    icon: "/chainIcons/berachain.svg",
  },
  747474: {
    chainId: 747474,
    name: "Katana",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://katana.drpc.org",
    explorer: "https://katanascan.com",
    isTestnet: false,
    icon: "/chainIcons/katana.webp",
  },

  // ---------- Testnets ----------
  97: {
    chainId: 97,
    name: "BNB Smart Chain Testnet",
    nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
    defaultRpc: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    explorer: "https://testnet.bscscan.com",
    isTestnet: true,
  },
  1301: {
    chainId: 1301,
    name: "Unichain Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://sepolia.unichain.org",
    explorer: "https://sepolia.uniscan.xyz",
    isTestnet: true,
  },
  1328: {
    chainId: 1328,
    name: "Sei Testnet",
    nativeCurrency: { name: "Sei", symbol: "SEI", decimals: 18 },
    defaultRpc: "https://evm-rpc-testnet.sei-apis.com",
    explorer: "https://seitrace.com",
    isTestnet: true,
  },
  5003: {
    chainId: 5003,
    name: "Mantle Sepolia Testnet",
    nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
    defaultRpc: "https://rpc.sepolia.mantle.xyz",
    explorer: "https://explorer.sepolia.mantle.xyz/",
    isTestnet: true,
  },
  5115: {
    chainId: 5115,
    name: "Citrea Testnet",
    nativeCurrency: { name: "cBTC", symbol: "cBTC", decimals: 18 },
    defaultRpc: "https://rpc.testnet.citrea.xyz",
    explorer: "https://explorer.testnet.citrea.xyz",
    isTestnet: true,
  },
  6343: {
    chainId: 6343,
    name: "MegaETH Testnet",
    nativeCurrency: { name: "MegaETH Testnet Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://carrot.megaeth.com/rpc",
    explorer: "https://www.megaexplorer.xyz/",
    isTestnet: true,
  },
  10143: {
    chainId: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "Testnet MON Token", symbol: "MON", decimals: 18 },
    defaultRpc: "https://testnet-rpc.monad.xyz",
    explorer: "https://testnet.monadexplorer.com",
    isTestnet: true,
  },
  10200: {
    chainId: 10200,
    name: "Gnosis Chiado",
    nativeCurrency: { name: "Gnosis", symbol: "xDAI", decimals: 18 },
    defaultRpc: "https://rpc.chiadochain.net",
    explorer: "https://blockscout.chiadochain.net",
    isTestnet: true,
  },
  13579: {
    chainId: 13579,
    name: "Intuition Testnet",
    nativeCurrency: { name: "TRUST", symbol: "TRUST", decimals: 18 },
    defaultRpc: "https://testnet.rpc.intuition.systems",
    explorer: "https://testnet.explorer.intuition.systems",
    isTestnet: true,
  },
  14601: {
    chainId: 14601,
    name: "Sonic Testnet",
    nativeCurrency: { name: "Sonic", symbol: "S", decimals: 18 },
    defaultRpc: "https://rpc.testnet.soniclabs.com",
    explorer: "https://testnet.sonicscan.org",
    isTestnet: true,
  },
  42431: {
    chainId: 42431,
    name: "Tempo Testnet (Moderato)",
    nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 },
    defaultRpc: "https://rpc.moderato.tempo.xyz",
    explorer: "https://explore.moderato.tempo.xyz",
    isTestnet: true,
  },
  59141: {
    chainId: 59141,
    name: "Linea Sepolia Testnet",
    nativeCurrency: { name: "Linea Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://rpc.sepolia.linea.build",
    explorer: "https://sepolia.lineascan.build",
    isTestnet: true,
  },
  80002: {
    chainId: 80002,
    name: "Polygon Amoy",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    defaultRpc: "https://rpc-amoy.polygon.technology",
    explorer: "https://amoy.polygonscan.com",
    isTestnet: true,
  },
  80069: {
    chainId: 80069,
    name: "Berachain Bepolia",
    nativeCurrency: { name: "BERA Token", symbol: "BERA", decimals: 18 },
    defaultRpc: "https://bepolia.rpc.berachain.com",
    explorer: "https://bepolia.beratrail.io",
    isTestnet: true,
  },
  84532: {
    chainId: 84532,
    name: "Base Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    isTestnet: true,
  },
  202601: {
    chainId: 202601,
    name: "Ronin Saigon",
    nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
    defaultRpc: "https://saigon-testnet.roninchain.com/rpc",
    explorer: "https://saigon-explorer.roninchain.com",
    isTestnet: true,
  },
  421614: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    nativeCurrency: { name: "Arbitrum Sepolia Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
    isTestnet: true,
  },
  560048: {
    chainId: 560048,
    name: "Hoodi",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://rpc.hoodi.ethpandaops.io",
    explorer: "https://hoodi.etherscan.io",
    isTestnet: true,
  },
  737373: {
    chainId: 737373,
    name: "Katana Bokuto",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://rpc.bokuto.katanarpc.com",
    explorer: "https://bokuto.katanascan.com",
    isTestnet: true,
  },
  763373: {
    chainId: 763373,
    name: "Ink Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://rpc-gel-sepolia.inkonchain.com",
    explorer: "https://explorer-sepolia.inkonchain.com/",
    isTestnet: true,
  },
  11142220: {
    chainId: 11142220,
    name: "Celo Sepolia Testnet",
    nativeCurrency: { name: "CELO", symbol: "S-CELO", decimals: 18 },
    defaultRpc: "https://forno.celo-sepolia.celo-testnet.org",
    explorer: "https://celo-sepolia.blockscout.com/",
    isTestnet: true,
  },
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://11155111.rpc.thirdweb.com",
    explorer: "https://sepolia.etherscan.io",
    isTestnet: true,
  },
  11155420: {
    chainId: 11155420,
    name: "OP Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    defaultRpc: "https://sepolia.optimism.io",
    explorer: "https://optimism-sepolia.blockscout.com",
    isTestnet: true,
  },
};

export const KNOWN_CHAIN_IDS = new Set<number>(
  Object.keys(KNOWN_CHAINS).map((k) => Number(k)),
);
