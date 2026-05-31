import { resolveChainInput } from "./chains.js";
import { isAddress } from "./evmEncoding.js";
import type {
  BungeeQuoteResponse,
  BungeeRoute,
  PortfolioResponse,
  SwapQuoteResponse,
} from "./walletchanApi.js";

export function selectBridgeRoute(quote: BungeeQuoteResponse): {
  route: BungeeRoute;
  source: "manual" | "auto-tx";
} | null {
  const manualRoute = quote.result?.manualRoutes?.[0];
  if (manualRoute) return { route: manualRoute, source: "manual" };
  const autoRoute = quote.result?.autoRoute;
  if (autoRoute?.txData) return { route: autoRoute, source: "auto-tx" };
  return null;
}

export function assertSwapIsUsable(
  quote: SwapQuoteResponse,
  allowWarnings: boolean,
): void {
  if (quote.liquidityAvailable === false) {
    throw new Error("Swap quote reports liquidityAvailable=false");
  }
  const warnings = swapWarnings(quote);
  if (warnings.length > 0 && !allowWarnings) {
    throw new Error(`Swap quote has blocking issue: ${warnings.join("; ")}`);
  }
}

export function swapWarnings(quote: SwapQuoteResponse): string[] {
  const warnings: string[] = [];
  const balance = quote.issues?.balance;
  if (balance?.actual && balance.expected && BigInt(balance.actual) < BigInt(balance.expected)) {
    warnings.push(`Insufficient ${balance.token || "sell token"} balance: ${balance.actual} < ${balance.expected}`);
  }
  return warnings;
}

export function summarizeSwapQuote(quote: SwapQuoteResponse): Record<string, unknown> {
  return {
    buyAmount: quote.buyAmount,
    sellAmount: quote.sellAmount,
    minBuyAmount: quote.minBuyAmount,
    liquidityAvailable: quote.liquidityAvailable,
    gas: quote.gas,
    totalNetworkFee: quote.totalNetworkFee,
    isPremiumFee: quote.isPremiumFee,
    route: quote.route,
  };
}

export function filterPortfolio(
  portfolio: PortfolioResponse,
  input: Record<string, unknown>,
): PortfolioResponse {
  const minValueUsd = optionalNumber(input.minValueUsd) ?? 0;
  const limit = optionalNumber(input.limit);
  let tokens = portfolio.tokens.filter((token) => token.valueUsd >= minValueUsd);
  if (limit && limit > 0) tokens = tokens.slice(0, limit);
  return {
    ...portfolio,
    tokens,
    defiPositions: input.includeDefi === false ? [] : portfolio.defiPositions,
  };
}

export function firstAddress(...values: unknown[]): string | null {
  for (const value of values) {
    if (isAddress(value)) return value;
  }
  return null;
}

export function requiredString(value: unknown, message: string): string {
  const text = optionalString(value);
  if (!text) throw new Error(message);
  return text;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function numberInput(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

export function resolveDestinationChain(value: unknown): number {
  return resolveChainInput(value).chainId ?? NaN;
}
