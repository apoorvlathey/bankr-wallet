import {
  BUNGEE_NATIVE_TOKEN,
  NATIVE_TOKEN_ADDRESS,
  isAddress,
  isNativeToken,
  normalizeAddress,
  parseDecimalAmount,
} from "./evmEncoding.js";
import type { TokenListEntry, WalletChanApiClient } from "./walletchanApi.js";

const WCHAN_BASE_TOKEN: TokenListEntry = {
  address: "0xBa5ED0000e1CA9136a695f0a848012A16008B032",
  name: "WalletChan",
  symbol: "WCHAN",
  decimals: 18,
  logoURI: "https://walletchan.com/images/walletchan-icon.png",
  chainId: 8453,
};

export interface ResolvedToken {
  input: string;
  address: string;
  apiAddress: string;
  bridgeAddress: string;
  native: boolean;
  symbol?: string;
  name?: string;
  decimals?: number;
  logoURI?: string;
}

export class WalletChanTokenResolver {
  constructor(private readonly api: WalletChanApiClient) {}

  async resolveSwapToken(chainId: number, token: string): Promise<ResolvedToken> {
    if (isNativeToken(token)) return nativeToken(NATIVE_TOKEN_ADDRESS);
    if (isAddress(token)) {
      return tokenFromList(token, await this.swapTokenList(chainId)) ?? addressToken(token);
    }
    return resolveTokenSymbol(token, await this.swapTokenList(chainId), NATIVE_TOKEN_ADDRESS);
  }

  async resolveBridgeToken(chainId: number, token: string): Promise<ResolvedToken> {
    if (isNativeToken(token)) return nativeToken(BUNGEE_NATIVE_TOKEN);
    if (isAddress(token)) {
      return tokenFromList(token, await this.bridgeTokenList(chainId)) ??
        addressToken(token, token);
    }
    return resolveTokenSymbol(token, await this.bridgeTokenList(chainId), BUNGEE_NATIVE_TOKEN);
  }

  private async swapTokenList(chainId: number): Promise<TokenListEntry[]> {
    const tokens = await this.api.swapTokens(chainId);
    return chainId === 8453 ? mergePinnedToken(tokens) : tokens;
  }

  private async bridgeTokenList(chainId: number): Promise<TokenListEntry[]> {
    const tokens = await this.api.bridgeTokens(chainId);
    return chainId === 8453 ? mergePinnedToken(tokens) : tokens;
  }
}

export function amountFromInput(
  input: Record<string, unknown>,
  decimalKey: string,
  rawKey: string,
  token: ResolvedToken,
): string {
  const raw = optionalString(input[rawKey] ?? input.amountWei ?? input.rawAmount);
  if (raw) {
    if (!/^[0-9]+$/.test(raw)) throw new Error(`${rawKey} must be a base-unit integer string`);
    return raw;
  }
  const decimal = optionalString(input[decimalKey] ?? input.amount);
  if (!decimal) throw new Error(`Missing ${decimalKey} or ${rawKey}`);
  const explicitDecimals = optionalNumber(input.decimals ?? input.tokenDecimals);
  const decimals = explicitDecimals ?? token.decimals;
  if (decimals === undefined) {
    throw new Error(`Token decimals are required to parse decimal amount for ${token.input}`);
  }
  return parseDecimalAmount(decimal, decimals);
}

function nativeToken(apiAddress: string): ResolvedToken {
  return {
    input: "native",
    address: NATIVE_TOKEN_ADDRESS,
    apiAddress: NATIVE_TOKEN_ADDRESS,
    bridgeAddress: apiAddress,
    native: true,
    symbol: "ETH",
    name: "Native token",
    decimals: 18,
  };
}

function addressToken(address: string, bridgeAddress = address): ResolvedToken {
  const normalized = normalizeAddress(address, "token");
  return {
    input: address,
    address: normalized,
    apiAddress: normalized,
    bridgeAddress,
    native: false,
  };
}

function tokenFromList(input: string, tokens: TokenListEntry[]): ResolvedToken | null {
  const lower = input.toLowerCase();
  const token = tokens.find((entry) => entry.address.toLowerCase() === lower);
  return token ? listedToken(input, token) : null;
}

function resolveTokenSymbol(input: string, tokens: TokenListEntry[], nativeSentinel: string): ResolvedToken {
  const symbol = input.trim().toLowerCase();
  if (symbol === "native" || symbol === "eth") return nativeToken(nativeSentinel);
  const matches = tokens.filter((entry) => entry.symbol?.toLowerCase() === symbol);
  if (matches.length === 0) {
    throw new Error(`Could not resolve token symbol "${input}". Pass a token address instead.`);
  }
  const uniqueAddresses = new Set(matches.map((entry) => entry.address.toLowerCase()));
  if (uniqueAddresses.size > 1) {
    throw new Error(
      `Token symbol "${input}" is ambiguous: ${matches.slice(0, 5).map((entry) => `${entry.symbol}:${entry.address}`).join(", ")}. Pass a token address.`,
    );
  }
  return listedToken(input, matches[0]);
}

function listedToken(input: string, token: TokenListEntry): ResolvedToken {
  const address = normalizeAddress(token.address, "token address");
  return {
    input,
    address,
    apiAddress: address,
    bridgeAddress: address,
    native: false,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    logoURI: token.logoURI,
  };
}

function mergePinnedToken(tokens: TokenListEntry[]): TokenListEntry[] {
  const wchanLower = WCHAN_BASE_TOKEN.address.toLowerCase();
  return [
    WCHAN_BASE_TOKEN,
    ...tokens.filter((token) => token.address.toLowerCase() !== wchanLower),
  ];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
