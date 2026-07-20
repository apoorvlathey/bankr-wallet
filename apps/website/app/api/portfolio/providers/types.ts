export const NATIVE_SENTINEL = "native";

export interface PortfolioToken {
  symbol: string;
  name: string;
  contractAddress: string;
  chainId: number;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  priceUsd: number;
  valueUsd: number;
  logoUrl?: string;
}

export interface DefiAsset {
  symbol: string;
  name: string;
  contractAddress: string;
  chainId: number;
  balance: string;
  balanceFormatted: string;
  valueUsd: number;
  logoUrl?: string;
}

export interface DefiPosition {
  protocol: string;
  protocolLogo?: string;
  chainId: number;
  type: string;
  name: string;
  valueUsd: number;
  siteUrl?: string;
  assets: DefiAsset[];
  rewardAssets: DefiAsset[];
}

export interface PortfolioResponse {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  tokenCount: number;
  omittedTokenCount: number;
  omittedTokenValueUsd: number;
  omittedTokenValueUsdByChain: Record<string, number>;
  truncated: boolean;
  /** Name of the provider that successfully served this response (e.g. "dune-sim"). */
  source?: string;
}

export interface ProviderResult {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  /**
   * If true, the provider returned a usable totalValueUsd (e.g. Octav reports
   * `networth` directly). The route will use this instead of summing tokens.
   */
  totalValueUsd?: number;
}

export interface PortfolioProvider {
  /** Stable identifier for logs / debugging. */
  name: string;
  /** True if env vars / config are present so the route should attempt this provider. */
  isConfigured(): boolean;
  /** Fetch a wallet's holdings on the given chains. Throw on any failure. */
  fetch(address: string, chainIds: readonly number[]): Promise<ProviderResult>;
}

/** BigInt-safe raw-wei → decimal number with up to 6 fractional digits of precision. */
export function rawToDecimal(amount: string, decimals: number): number {
  if (!amount || amount === "0") return 0;
  if (decimals <= 0) return Number(amount);
  let raw: bigint;
  try {
    raw = BigInt(amount);
  } catch {
    return parseFloat(amount) / 10 ** decimals;
  }
  if (raw === 0n) return 0;
  if (decimals <= 6) return Number(raw) / 10 ** decimals;
  const scale = decimals - 6;
  const scaled = raw / 10n ** BigInt(scale);
  return Number(scaled) / 1_000_000;
}

export function formatBalance(balance: number | string | undefined): string {
  if (!balance) return "0";
  const num = typeof balance === "string" ? parseFloat(balance) : balance;
  if (isNaN(num)) return "0";
  if (num < 0.000001) return "<0.000001";
  if (num < 1) return num.toPrecision(4);
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function normalizeContractAddress(addr: string | null | undefined): string {
  if (!addr) return NATIVE_SENTINEL;
  if (
    addr === NATIVE_SENTINEL ||
    addr === "0x0000000000000000000000000000000000000000" ||
    addr.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  ) {
    return NATIVE_SENTINEL;
  }
  return addr.toLowerCase();
}
