import type { Address } from "viem";

export type TestChainConfig = {
  chainId: number;
  name: string;
  explorer: string;
  nativeSymbol: string;
  usdc?: { address: Address; decimals: number; symbol: string };
};

export const TEST_CHAINS: Record<number, TestChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    explorer: "https://etherscan.io",
    nativeSymbol: "ETH",
    usdc: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      symbol: "USDC",
    },
  },
  8453: {
    chainId: 8453,
    name: "Base",
    explorer: "https://basescan.org",
    nativeSymbol: "ETH",
    usdc: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      symbol: "USDC",
    },
  },
  137: {
    chainId: 137,
    name: "Polygon",
    explorer: "https://polygonscan.com",
    nativeSymbol: "POL",
    usdc: {
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      decimals: 6,
      symbol: "USDC",
    },
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum",
    explorer: "https://arbiscan.io",
    nativeSymbol: "ETH",
    usdc: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      symbol: "USDC",
    },
  },
  10: {
    chainId: 10,
    name: "Optimism",
    explorer: "https://optimistic.etherscan.io",
    nativeSymbol: "ETH",
    usdc: {
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      decimals: 6,
      symbol: "USDC",
    },
  },
  130: {
    chainId: 130,
    name: "Unichain",
    explorer: "https://uniscan.xyz",
    nativeSymbol: "ETH",
    usdc: {
      address: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
      decimals: 6,
      symbol: "USDC",
    },
  },
};

/** A chain definition to feed `wallet_addEthereumChain` — not currently in the wallet's registry so the Add Chain popup fires. */
export const ADD_CHAIN_TEST_PARAMS = {
  chainId: "0x14a34", // Base Sepolia (84532)
  chainName: "Base Sepolia",
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://sepolia.base.org"],
  blockExplorerUrls: ["https://sepolia.basescan.org"],
};

/** Token to show in the `wallet_watchAsset` popup. WCHAN on Base — real token with a logo. */
export const WATCH_ASSET_TEST_PARAMS = {
  type: "ERC20",
  options: {
    address: "0x6B7aCF45a2e7395d9feBb96ddF6B14e2F69d79A8",
    symbol: "WCHAN",
    decimals: 18,
    image: "https://walletchan.com/images/wchan.png",
  },
};

/** Permit (EIP-2612) domain + types for USDC on Base, for the typed-data signing test. */
export const USDC_PERMIT_DOMAIN = (
  chainId: number,
  verifyingContract: Address,
) => ({
  name: "USD Coin",
  version: "2",
  chainId,
  verifyingContract,
});

export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Toy EIP-712 payload from the spec — good generic test for typed data UI. */
export const MAIL_TYPED_DATA = {
  domain: {
    name: "Ether Mail",
    version: "1",
    chainId: 1,
    verifyingContract:
      "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address,
  },
  types: {
    Person: [
      { name: "name", type: "string" },
      { name: "wallet", type: "address" },
    ],
    Mail: [
      { name: "from", type: "Person" },
      { name: "to", type: "Person" },
      { name: "contents", type: "string" },
    ],
  },
  primaryType: "Mail" as const,
  message: {
    from: {
      name: "Cow",
      wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826" as Address,
    },
    to: {
      name: "Bob",
      wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
    },
    contents: "Hello, Bob!",
  },
};
