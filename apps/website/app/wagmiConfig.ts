import { http, createConfig, fallback } from "wagmi";
import {
  mainnet,
  base,
  polygon,
  unichain,
  arbitrum,
  optimism,
  bsc,
  avalanche,
  zora,
  celo,
  gnosis,
  ink,
  pulsechain,
  soneium,
  sonic,
  megaeth,
  sepolia,
} from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  rainbowWallet,
  coinbaseWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { impersonatorWallet } from "./utils/impersonatorConnector";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

// Create a global variable to store the modal opener function
let globalOpenImpersonatorModal: (() => Promise<any>) | null = null;

export const setGlobalOpenImpersonatorModal = (
  fn: (() => Promise<any>) | null
) => {
  globalOpenImpersonatorModal = fn;
};

const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [
        impersonatorWallet({
          openModal: () => {
            if (!globalOpenImpersonatorModal) {
              throw new Error("Impersonator modal not initialized");
            }
            return globalOpenImpersonatorModal();
          },
        }),
        metaMaskWallet,
        coinbaseWallet,
        walletConnectWallet,
        rainbowWallet,
      ],
    },
  ],
  { appName: "WalletChan", projectId },
);

export const walletChains = [
  mainnet,
  base,
  polygon,
  unichain,
  arbitrum,
  optimism,
  bsc,
  avalanche,
  zora,
  celo,
  gnosis,
  ink,
  pulsechain,
  soneium,
  sonic,
  megaeth,
  sepolia,
] as const;

/** Custom RPC URLs for the ImpersonatorIframeProvider */
export const CHAIN_RPC_URLS: Record<number, string> = {
  1: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://eth.llamarpc.com",
  8453: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://base.llamarpc.com",
  137: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || "https://1rpc.io/matic",
  130: "https://mainnet.unichain.org",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  56: "https://bsc-dataseed.binance.org",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  7777777: "https://rpc.zora.energy",
  42220: "https://forno.celo.org",
  100: "https://rpc.gnosischain.com",
  57073: "https://rpc-gel.inkonchain.com",
  369: "https://rpc.pulsechain.com",
  1868: "https://rpc.soneium.org",
  146: "https://rpc.soniclabs.com",
  4326: "https://mainnet.megaeth.com/rpc",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
};

/** Additional fallback RPC URLs per chain */
const CHAIN_FALLBACK_RPCS: Record<number, string[]> = {
  8453: ["https://mainnet.base.org"],
};

export const config = createConfig({
  connectors,
  chains: walletChains,
  transports: walletChains.reduce<
    Record<number, ReturnType<typeof http> | ReturnType<typeof fallback>>
  >(
    (acc, chain) => {
      const fallbacks = CHAIN_FALLBACK_RPCS[chain.id];
      if (fallbacks?.length) {
        acc[chain.id] = fallback([
          http(CHAIN_RPC_URLS[chain.id]),
          ...fallbacks.map((url) => http(url)),
        ]);
      } else {
        acc[chain.id] = http(CHAIN_RPC_URLS[chain.id]);
      }
      return acc;
    },
    {},
  ),
});
