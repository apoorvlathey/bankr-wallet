import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { NATIVE_FEE_TOKEN_ID } from "./constants";

export type FeePaymentTokenId = typeof NATIVE_FEE_TOKEN_ID | `0x${string}`;

export type FeePaymentToken =
  | {
      kind: "native";
      id: typeof NATIVE_FEE_TOKEN_ID;
      symbol: string;
      decimals: number;
    }
  | PimlicoFeeToken;

export interface PimlicoFeeToken {
  kind: "erc20";
  id: `0x${string}`;
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  stablecoin: boolean;
  /** Absolute fail-closed ceiling for one network fee, in token base units. */
  maximumGasCost: bigint;
  logoUrl?: string;
}

const USDC_LOGO =
  "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png";
const USDT_LOGO =
  "https://coin-images.coingecko.com/coins/images/325/small/Tether.png";
const WETH_LOGO =
  "https://coin-images.coingecko.com/coins/images/2518/small/weth.png";
const STETH_LOGO =
  "https://coin-images.coingecko.com/coins/images/13442/small/steth_logo.png";
const WSTETH_LOGO =
  "https://coin-images.coingecko.com/coins/images/18834/small/wstETH.png";

function token(
  address: `0x${string}`,
  symbol: string,
  decimals: number,
  options: {
    stablecoin?: boolean;
    maximumTokens?: bigint;
    logoUrl?: string;
  } = {},
): PimlicoFeeToken {
  const stablecoin = options.stablecoin === true;
  return {
    kind: "erc20",
    id: address,
    address,
    symbol,
    decimals,
    stablecoin,
    maximumGasCost:
      (options.maximumTokens ?? (stablecoin ? 100n : 1n)) *
      10n ** BigInt(decimals),
    ...(options.logoUrl ? { logoUrl: options.logoUrl } : {}),
  };
}

const usdc = (address: `0x${string}`) =>
  token(address, "USDC", 6, { stablecoin: true, logoUrl: USDC_LOGO });
const usdt = (address: `0x${string}`, decimals = 6) =>
  token(address, "USDT", decimals, { stablecoin: true, logoUrl: USDT_LOGO });

/**
 * Exact chain/token pairs accepted by WalletChan and Pimlico's ERC-20
 * paymaster. This fixed catalog is mirrored by the website proxy; symbols or
 * arbitrary dapp-provided addresses never grant relay access.
 */
export const PIMLICO_FEE_TOKENS_BY_CHAIN_ID = Object.freeze({
  1: [
    usdc("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), // Ethereum USDC
    usdt("0xdAC17F958D2ee523a2206206994597C13D831ec7"), // Ethereum USDT
    token("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", "stETH", 18, { logoUrl: STETH_LOGO }), // Ethereum stETH
    token("0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", "wstETH", 18, { logoUrl: WSTETH_LOGO }), // Ethereum wstETH
    token("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "WETH", 18, { logoUrl: WETH_LOGO }), // Ethereum WETH
  ],
  10: [
    usdc("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"), // Optimism USDC
    token("0x7F5c764cBc14f9669B88837ca1490cCa17c31607", "USDC.e", 6, { stablecoin: true, logoUrl: USDC_LOGO }), // Optimism bridged USDC
    usdt("0x94b008aA00579c1307B0EF2c499aD98a8ce58e58"), // Optimism USDT
    token("0x76A50b8c7349cCDDb7578c6627e79b5d99D24138", "stETH", 18, { logoUrl: STETH_LOGO }), // Optimism stETH
    token("0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb", "wstETH", 18, { logoUrl: WSTETH_LOGO }), // Optimism wstETH
  ],
  56: [usdt("0x55d398326f99059fF775485246999027B3197955", 18)], // BNB Chain USDT
  137: [
    usdc("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"), // Polygon USDC
    usdt("0xc2132D05D31c914a87C6611C10748AEb04B58e8F"), // Polygon USDT
  ],
  143: [
    usdc("0x754704Bc059F8C67012fEd69BC8A327a5aafb603"), // Monad USDC
    token("0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A", "WMON", 18), // Monad WMON
  ],
  4326: [
    token("0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7", "USDm", 18, { stablecoin: true }), // MegaETH USDm
    token("0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", "USDT0", 6, { stablecoin: true, logoUrl: USDT_LOGO }), // MegaETH USDT0
  ],
  8453: [
    usdc("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"), // Base USDC
    usdt("0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"), // Base USDT
  ],
  59144: [usdt("0xA219439258ca9da29E9Cc4cE5596924745e12B93")], // Linea USDT
  42161: [
    usdc("0xaf88d065e77c8cC2239327C5EDb3A432268e5831"), // Arbitrum One USDC
    usdt("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"), // Arbitrum One USDT
  ],
  80002: [usdc("0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582")], // Polygon Amoy USDC
  11155111: [usdc("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238")], // Ethereum Sepolia USDC
  11155420: [usdc("0x5fd84259d66Cd46123540766Be93DFE6D43130D7")], // Optimism Sepolia USDC
  421614: [usdc("0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d")], // Arbitrum Sepolia USDC
} satisfies Readonly<Record<number, readonly PimlicoFeeToken[]>>);

function getNativeCurrency(chainId: number) {
  const direct = CHAIN_REGISTRY.find((chain) => chain.chainId === chainId);
  if (direct) return direct.nativeCurrency;
  const parent = CHAIN_REGISTRY.find((chain) =>
    chain.testnetChainIds.includes(chainId),
  );
  return parent?.nativeCurrency;
}

export function getPimlicoFeeTokens(chainId: number): readonly PimlicoFeeToken[] {
  return PIMLICO_FEE_TOKENS_BY_CHAIN_ID[
    chainId as keyof typeof PIMLICO_FEE_TOKENS_BY_CHAIN_ID
  ] ?? [];
}

export function getPimlicoFeeToken(
  chainId: number,
  tokenId: unknown,
): PimlicoFeeToken | null {
  if (typeof tokenId !== "string") return null;
  return getPimlicoFeeTokens(chainId).find(
    (candidate) => candidate.id.toLowerCase() === tokenId.toLowerCase(),
  ) ?? null;
}

export function getFeePaymentTokens(chainId: number): FeePaymentToken[] {
  const nativeCurrency = getNativeCurrency(chainId);
  if (!nativeCurrency) return [];
  return [
    {
      kind: "native",
      id: NATIVE_FEE_TOKEN_ID,
      symbol: nativeCurrency.symbol,
      decimals: nativeCurrency.decimals,
    },
    ...getPimlicoFeeTokens(chainId),
  ];
}

export const PIMLICO_USDC_BY_CHAIN_ID = Object.freeze(
  Object.fromEntries(
    Object.entries(PIMLICO_FEE_TOKENS_BY_CHAIN_ID).flatMap(([chainId, tokens]) => {
      const match = tokens.find((candidate) => candidate.symbol === "USDC");
      return match ? [[Number(chainId), match.address]] : [];
    }),
  ) as Readonly<Record<number, `0x${string}`>>,
);

export function getPimlicoUsdcAddress(chainId: number): `0x${string}` | null {
  return PIMLICO_USDC_BY_CHAIN_ID[chainId] ?? null;
}
