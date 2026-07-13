/**
 * Storage helper for portfolio tokens hidden globally by the user.
 * Key: "hiddenPortfolioTokens" in chrome.storage.local
 */

import type { PortfolioToken } from "./api";

export interface HiddenPortfolioToken {
  chainId: number;
  contractAddress: string;
  symbol?: string;
  name?: string;
  logoUrl?: string;
  hiddenAt: number;
}

const STORAGE_KEY = "hiddenPortfolioTokens";

export function getPortfolioTokenKey(
  chainId: number,
  contractAddress: string,
): string {
  return `${chainId}-${contractAddress.toLowerCase()}`;
}

function isHiddenPortfolioToken(value: unknown): value is HiddenPortfolioToken {
  if (!value || typeof value !== "object") return false;
  const token = value as Partial<HiddenPortfolioToken>;
  return (
    typeof token.chainId === "number" &&
    typeof token.contractAddress === "string"
  );
}

function normalizeToken(token: HiddenPortfolioToken): HiddenPortfolioToken {
  return {
    ...token,
    contractAddress: token.contractAddress.toLowerCase(),
    hiddenAt: typeof token.hiddenAt === "number" ? token.hiddenAt : Date.now(),
  };
}

function dedupeTokens(tokens: HiddenPortfolioToken[]): HiddenPortfolioToken[] {
  const byKey = new Map<string, HiddenPortfolioToken>();

  for (const token of tokens) {
    const normalized = normalizeToken(token);
    const key = getPortfolioTokenKey(
      normalized.chainId,
      normalized.contractAddress,
    );
    const existing = byKey.get(key);
    if (!existing || normalized.hiddenAt >= existing.hiddenAt) {
      byKey.set(key, normalized);
    }
  }

  return Array.from(byKey.values());
}

async function getStore(): Promise<HiddenPortfolioToken[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY];

  if (Array.isArray(store)) {
    return dedupeTokens(store.filter(isHiddenPortfolioToken));
  }

  // Older development builds stored hidden tokens under each owner address.
  // Flatten that shape so a token hidden once becomes hidden globally.
  if (store && typeof store === "object") {
    const tokens = Object.values(store)
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .filter(isHiddenPortfolioToken);
    return dedupeTokens(tokens);
  }

  return [];
}

async function writeStore(tokens: HiddenPortfolioToken[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: dedupeTokens(tokens) });
}

export async function getHiddenPortfolioTokens(): Promise<
  HiddenPortfolioToken[]
> {
  return getStore();
}

export async function getHiddenPortfolioTokenKeys(): Promise<Set<string>> {
  const hidden = await getHiddenPortfolioTokens();
  return new Set(
    hidden.map((token) =>
      getPortfolioTokenKey(token.chainId, token.contractAddress),
    ),
  );
}

export async function hidePortfolioToken(
  token: Pick<
    PortfolioToken,
    "chainId" | "contractAddress" | "symbol" | "name" | "logoUrl"
  >,
): Promise<void> {
  await hidePortfolioTokens([token]);
}

export async function hidePortfolioTokens(
  tokens: Array<
    Pick<
      PortfolioToken,
      "chainId" | "contractAddress" | "symbol" | "name" | "logoUrl"
    >
  >,
): Promise<void> {
  if (tokens.length === 0) return;

  const existing = await getStore();
  const hiddenAt = Date.now();
  const nextByKey = new Map(
    existing.map((item) => [
      getPortfolioTokenKey(item.chainId, item.contractAddress),
      item,
    ]),
  );

  for (const token of tokens) {
    nextByKey.set(getPortfolioTokenKey(token.chainId, token.contractAddress), {
      chainId: token.chainId,
      contractAddress: token.contractAddress.toLowerCase(),
      symbol: token.symbol,
      name: token.name,
      logoUrl: token.logoUrl,
      hiddenAt,
    });
  }

  await writeStore(Array.from(nextByKey.values()));
}

export async function unhidePortfolioToken(
  chainId: number,
  contractAddress: string,
): Promise<void> {
  const key = getPortfolioTokenKey(chainId, contractAddress);
  const existing = await getStore();
  const next = existing.filter(
    (item) => getPortfolioTokenKey(item.chainId, item.contractAddress) !== key,
  );

  if (next.length === existing.length) return;
  await writeStore(next);
}
