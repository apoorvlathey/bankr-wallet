import type { DefiPosition, PortfolioToken } from "@/chrome/portfolioApi";
import { getPortfolioTokenKey } from "@/chrome/hiddenPortfolioTokens";
import type { AssetChangeRecord, CompletedTransaction } from "@/chrome/txHistoryStorage";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const LOW_VALUE_TOKEN_THRESHOLD_USD = 0.1;

export function isNativePortfolioToken(token: PortfolioToken): boolean {
  return (
    token.contractAddress === "native" ||
    token.contractAddress.toLowerCase() === ZERO_ADDRESS
  );
}

export function hasPositiveBalance(token: PortfolioToken): boolean {
  return parseFloat(token.balance || "0") > 0;
}

/**
 * Return the canonical decimal balance used for arithmetic.
 *
 * `balanceFormatted` is presentation-only and may contain threshold markers
 * such as "<0.000001" or locale separators, so it must never be coerced into
 * a number for portfolio totals.
 */
export function getPortfolioTokenBalance(token: PortfolioToken): number {
  const balance = Number(token.balance);
  return Number.isFinite(balance) && balance >= 0 ? balance : 0;
}

export function sortTokensByValue(tokens: PortfolioToken[]): PortfolioToken[] {
  return [...tokens].sort((a, b) => b.valueUsd - a.valueUsd);
}

export function shouldFetchOnInitialPortfolioLoad(
  token: PortfolioToken,
  includeLowValueTokens: boolean,
): boolean {
  if (includeLowValueTokens) return true;
  if (isNativePortfolioToken(token)) return true;
  return token.valueUsd >= LOW_VALUE_TOKEN_THRESHOLD_USD;
}

export function getTokenKeySet(tokens: PortfolioToken[]): Set<string> {
  return new Set(
    tokens.map((token) =>
      getPortfolioTokenKey(token.chainId, token.contractAddress),
    ),
  );
}

export function mergeTokenBalanceRefresh(
  baseTokens: PortfolioToken[],
  refreshedTokens: PortfolioToken[],
  refreshedKeys: Set<string>,
): PortfolioToken[] {
  const refreshedByKey = new Map(
    refreshedTokens.map((token) => [
      getPortfolioTokenKey(token.chainId, token.contractAddress),
      token,
    ]),
  );

  const merged = baseTokens.flatMap((token) => {
    const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
    const refreshed = refreshedByKey.get(key);
    if (refreshed) return [refreshed];
    if (refreshedKeys.has(key)) return [];
    return [token];
  });

  return sortTokensByValue(merged.filter(hasPositiveBalance));
}

/**
 * Overlay balances that were successfully read from RPC onto a fresh API
 * catalog. A verified key without a token is a zero-balance tombstone: the
 * RPC pass removed it, so a lagging portfolio response must not add it back.
 *
 * Catalog metadata and prices stay fresh while the canonical decimal balance
 * remains onchain-authoritative.
 */
export function mergeVerifiedTokenBalances(
  catalogTokens: PortfolioToken[],
  verifiedTokens: PortfolioToken[],
  verifiedTokenKeys: Set<string>,
): PortfolioToken[] {
  const verifiedByKey = new Map(
    verifiedTokens.map((token) => [
      getPortfolioTokenKey(token.chainId, token.contractAddress),
      token,
    ]),
  );

  const merged = catalogTokens.flatMap((token) => {
    const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
    if (!verifiedTokenKeys.has(key)) return [token];

    const verified = verifiedByKey.get(key);
    if (!verified) return [];

    const balance = getPortfolioTokenBalance(verified);
    return [{
      ...token,
      balance: verified.balance,
      balanceFormatted: verified.balanceFormatted,
      valueUsd: balance * token.priceUsd,
    }];
  });

  return sortTokensByValue(merged.filter(hasPositiveBalance));
}

export function getWalletTokenTotal(tokens: PortfolioToken[]): number {
  return tokens.reduce((sum, token) => sum + token.valueUsd, 0);
}

export function getDefiTotal(defiPositions: DefiPosition[]): number {
  return defiPositions.reduce((sum, position) => sum + position.valueUsd, 0);
}

export interface ReceiptTokenRefresh {
  tokenKeys: Set<string>;
  tokenStubs: PortfolioToken[];
}

export function getReceiptTokenRefresh(
  tx: CompletedTransaction | null | undefined,
): ReceiptTokenRefresh {
  const tokenByKey = new Map<string, PortfolioToken>();

  const addRecord = (chainId: number | undefined, record?: AssetChangeRecord) => {
    if (!chainId || !record) return;
    for (const transfer of record.erc20Transfers) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(transfer.token)) continue;
      const contractAddress = transfer.token.toLowerCase();
      const key = getPortfolioTokenKey(chainId, contractAddress);
      if (tokenByKey.has(key)) continue;

      const label =
        transfer.symbol || `${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)}`;
      tokenByKey.set(key, {
        symbol: label,
        name: label,
        contractAddress,
        chainId,
        decimals: transfer.decimals ?? 18,
        balance: "0",
        balanceFormatted: "0",
        priceUsd: 0,
        valueUsd: 0,
        logoUrl: transfer.logoUrl,
      });
    }
  };

  addRecord(tx?.chainId, tx?.assetChanges);
  addRecord(tx?.bridge?.destinationChainId, tx?.destAssetChanges);

  return {
    tokenKeys: new Set(tokenByKey.keys()),
    tokenStubs: Array.from(tokenByKey.values()),
  };
}
