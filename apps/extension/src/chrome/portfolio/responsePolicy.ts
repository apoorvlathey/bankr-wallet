import type {
  DefiAsset,
  DecodedPortfolioResponse,
  DefiPosition,
  PortfolioToken,
} from "./apiTypes";

export const MAX_REMOTE_PORTFOLIO_TOKENS = 1_000;
export const MAX_REMOTE_DEFI_POSITIONS = 100;
export const MAX_REMOTE_DEFI_ASSETS_PER_POSITION = 50;

const MAX_TOKEN_CANDIDATES = 20_000;
const MAX_POSITION_CANDIDATES = 500;
const MAX_REPORTED_TOKEN_COUNT = 1_000_000;
const MAX_TEXT_LENGTH = 128;
const MAX_SYMBOL_LENGTH = 64;
const MAX_URL_LENGTH = 2_048;
const MAX_NUMERIC_TEXT_LENGTH = 160;
const MAX_USD_VALUE = 1_000_000_000_000_000;
const MAX_PRESERVED_NATIVE_TOKENS = 64;

interface BoundedTokens {
  tokens: PortfolioToken[];
  candidateCount: number;
  omittedTokenCount: number;
  omittedTokenValueUsd: number;
  omittedTokenValueUsdByChain: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function boundedText(
  value: unknown,
  maximum: number,
  fallback = "",
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximum) : fallback;
}

function finiteUsd(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(value, MAX_USD_VALUE)
    : 0;
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function boundedCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_REPORTED_TOKEN_COUNT
    ? value
    : null;
}

function numericText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_NUMERIC_TEXT_LENGTH) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 0 ? normalized : null;
}

function contractAddress(value: unknown): string | null {
  if (value === "native") return value;
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseToken(value: unknown): PortfolioToken | null {
  if (!isRecord(value)) return null;
  const address = contractAddress(value.contractAddress);
  const chainId = positiveSafeInteger(value.chainId);
  const balance = numericText(value.balance);
  const decimals = value.decimals;
  if (
    !address ||
    !chainId ||
    !balance ||
    typeof decimals !== "number" ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  ) {
    return null;
  }

  const symbol = boundedText(value.symbol, MAX_SYMBOL_LENGTH, "???");
  return {
    symbol,
    name: boundedText(value.name, MAX_TEXT_LENGTH, symbol),
    contractAddress: address,
    chainId,
    decimals,
    balance,
    balanceFormatted: boundedText(
      value.balanceFormatted,
      MAX_NUMERIC_TEXT_LENGTH,
      balance,
    ),
    priceUsd: finiteUsd(value.priceUsd),
    valueUsd: finiteUsd(value.valueUsd),
    logoUrl: safeHttpsUrl(value.logoUrl),
  };
}

function parseDefiAsset(value: unknown): DefiAsset | null {
  if (!isRecord(value)) return null;
  const address = contractAddress(value.contractAddress);
  const chainId = positiveSafeInteger(value.chainId);
  const balance = numericText(value.balance);
  if (!address || !chainId || !balance) return null;
  const symbol = boundedText(value.symbol, MAX_SYMBOL_LENGTH, "???");
  return {
    symbol,
    name: boundedText(value.name, MAX_TEXT_LENGTH, symbol),
    contractAddress: address,
    chainId,
    balance,
    balanceFormatted: boundedText(
      value.balanceFormatted,
      MAX_NUMERIC_TEXT_LENGTH,
      balance,
    ),
    valueUsd: finiteUsd(value.valueUsd),
    logoUrl: safeHttpsUrl(value.logoUrl),
  };
}

function parseDefiAssets(value: unknown): DefiAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_REMOTE_DEFI_ASSETS_PER_POSITION)
    .map(parseDefiAsset)
    .filter((asset): asset is DefiAsset => asset !== null);
}

function parseDefiPosition(value: unknown): DefiPosition | null {
  if (!isRecord(value)) return null;
  const chainId = positiveSafeInteger(value.chainId);
  if (!chainId) return null;
  return {
    protocol: boundedText(value.protocol, MAX_TEXT_LENGTH, "DeFi"),
    protocolLogo: safeHttpsUrl(value.protocolLogo),
    chainId,
    type: boundedText(value.type, MAX_TEXT_LENGTH, "position"),
    name: boundedText(value.name, MAX_TEXT_LENGTH, "Position"),
    valueUsd: finiteUsd(value.valueUsd),
    siteUrl: boundedText(value.siteUrl, MAX_URL_LENGTH) || undefined,
    assets: parseDefiAssets(value.assets),
    rewardAssets: parseDefiAssets(value.rewardAssets),
  };
}

function tokenKey(token: PortfolioToken): string {
  return `${token.chainId}:${token.contractAddress}`;
}

function isNativeToken(token: PortfolioToken): boolean {
  return (
    token.contractAddress === "native" ||
    token.contractAddress === "0x0000000000000000000000000000000000000000"
  );
}

export function boundPortfolioTokens(
  value: unknown,
  maximum = MAX_REMOTE_PORTFOLIO_TOKENS,
): BoundedTokens | null {
  if (
    !Array.isArray(value) ||
    value.length > MAX_TOKEN_CANDIDATES ||
    maximum <= 0
  ) {
    return null;
  }

  const unique = new Map<string, PortfolioToken>();
  for (const candidate of value) {
    const token = parseToken(candidate);
    if (!token) continue;
    const key = tokenKey(token);
    const current = unique.get(key);
    if (!current || token.valueUsd > current.valueUsd) unique.set(key, token);
  }

  const ranked = Array.from(unique.values()).sort(
    (a, b) => b.valueUsd - a.valueUsd,
  );
  const selected = new Map<string, PortfolioToken>();
  for (const token of ranked) {
    if (selected.size >= Math.min(maximum, MAX_PRESERVED_NATIVE_TOKENS)) break;
    if (isNativeToken(token)) selected.set(tokenKey(token), token);
  }
  for (const token of ranked) {
    if (selected.size >= maximum) break;
    selected.set(tokenKey(token), token);
  }

  const tokens = Array.from(selected.values()).sort(
    (a, b) => b.valueUsd - a.valueUsd,
  );
  const omittedTokenValueUsdByChain: Record<string, number> = {};
  let omittedTokenValueUsd = 0;
  for (const token of ranked) {
    if (selected.has(tokenKey(token))) continue;
    omittedTokenValueUsd += token.valueUsd;
    const chainKey = String(token.chainId);
    omittedTokenValueUsdByChain[chainKey] =
      (omittedTokenValueUsdByChain[chainKey] ?? 0) + token.valueUsd;
  }

  return {
    tokens,
    candidateCount: value.length,
    omittedTokenCount: Math.max(0, value.length - tokens.length),
    omittedTokenValueUsd,
    omittedTokenValueUsdByChain,
  };
}

export function sanitizeDefiPositions(value: unknown): DefiPosition[] | null {
  if (!Array.isArray(value) || value.length > MAX_POSITION_CANDIDATES) return null;
  return value
    .slice(0, MAX_REMOTE_DEFI_POSITIONS)
    .map(parseDefiPosition)
    .filter((position): position is DefiPosition => position !== null);
}

function mergeChainValues(
  target: Record<string, number>,
  value: unknown,
): void {
  if (!isRecord(value)) return;
  for (const [chainKey, amount] of Object.entries(value).slice(0, 100)) {
    const chainId = Number(chainKey);
    if (!positiveSafeInteger(chainId)) continue;
    target[String(chainId)] =
      (target[String(chainId)] ?? 0) + finiteUsd(amount);
  }
}

export function decodePortfolioResponse(payload: unknown): DecodedPortfolioResponse {
  if (!isRecord(payload)) throw new Error("Portfolio API returned an invalid response");
  const bounded = boundPortfolioTokens(payload.tokens);
  const defiPositions = sanitizeDefiPositions(payload.defiPositions);
  if (!bounded || !defiPositions) {
    throw new Error("Portfolio API returned an invalid response");
  }

  const reportedCount = boundedCount(payload.tokenCount);
  const tokenCount = Math.max(reportedCount ?? 0, bounded.candidateCount);
  const reportedOmittedCount = boundedCount(payload.omittedTokenCount) ?? 0;
  const omittedTokenCount = Math.max(
    reportedOmittedCount + bounded.omittedTokenCount,
    tokenCount - bounded.tokens.length,
  );
  const omittedTokenValueUsdByChain = {
    ...bounded.omittedTokenValueUsdByChain,
  };
  mergeChainValues(
    omittedTokenValueUsdByChain,
    payload.omittedTokenValueUsdByChain,
  );

  return {
    tokens: bounded.tokens,
    defiPositions,
    totalValueUsd: finiteUsd(payload.totalValueUsd),
    tokenCount,
    omittedTokenCount,
    omittedTokenValueUsd:
      bounded.omittedTokenValueUsd + finiteUsd(payload.omittedTokenValueUsd),
    omittedTokenValueUsdByChain,
    truncated: payload.truncated === true || omittedTokenCount > 0,
    source: boundedText(payload.source, MAX_SYMBOL_LENGTH) || undefined,
  };
}
