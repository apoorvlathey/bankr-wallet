export const DEFAULT_WALLETCHAN_API_BASE = "https://walletchan.com/api";

const REQUEST_TIMEOUT_MS = 20_000;

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

export interface PortfolioResponse {
  tokens: PortfolioToken[];
  defiPositions: unknown[];
  totalValueUsd: number;
  source?: string;
}

export interface TokenListEntry {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  logoURI?: string;
  chainId?: number;
}

export interface SwapApiParams {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker?: string;
  recipient?: string;
  slippageBps?: number;
}

export interface SwapQuoteResponse {
  buyAmount?: string;
  sellAmount?: string;
  buyToken?: string;
  sellToken?: string;
  gas?: string;
  gasPrice?: string;
  totalNetworkFee?: string;
  liquidityAvailable?: boolean;
  minBuyAmount?: string;
  allowanceTarget?: string;
  issues?: {
    allowance?: { spender?: string; actual?: string; expected?: string };
    balance?: { token?: string; actual?: string; expected?: string };
    permit2Approval?: { token?: string; spender?: string };
  };
  fees?: Record<string, unknown>;
  route?: unknown;
  transaction?: {
    to: string;
    data: string;
    value: string;
    gas?: string;
    gasPrice?: string;
  };
  isPremiumFee?: boolean;
  [key: string]: unknown;
}

export interface BridgeQuoteParams {
  userAddress: string;
  receiverAddress?: string;
  originChainId: number;
  destinationChainId: number;
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  slippage?: number;
}

export interface BungeeApprovalData {
  amount: string;
  tokenAddress: string;
  spenderAddress: string;
  userAddress?: string;
}

export interface BungeeTxData {
  to: string;
  data: string;
  value: string;
  chainId?: number;
}

export interface BungeeRoute {
  output?: unknown;
  quoteId?: string;
  quoteExpiry?: number;
  txData?: BungeeTxData;
  approvalData?: BungeeApprovalData | null;
  routeDetails?: { name?: string; logoURI?: string };
  estimatedTime?: number;
  [key: string]: unknown;
}

export interface BungeeQuoteResponse {
  success?: boolean;
  result?: {
    input?: unknown;
    manualRoutes?: BungeeRoute[];
    autoRoute?: BungeeRoute | null;
    quoteId?: string;
    quoteExpiry?: number;
  };
  isPremiumFee?: boolean;
  feeBps?: string;
  [key: string]: unknown;
}

export interface BungeeBuildTxResponse {
  success?: boolean;
  result?: {
    txData?: BungeeTxData;
    approvalData?: BungeeApprovalData | null;
    userOp?: string;
  };
  [key: string]: unknown;
}

export interface BridgeStatusResponse {
  success?: boolean;
  result?: unknown[];
  [key: string]: unknown;
}

export class WalletChanApiClient {
  readonly baseUrl: string;

  constructor(baseUrl = DEFAULT_WALLETCHAN_API_BASE) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
  }

  async portfolio(address: string): Promise<PortfolioResponse> {
    return this.getJson<PortfolioResponse>("/portfolio", { address });
  }

  async swapPrice(params: SwapApiParams): Promise<SwapQuoteResponse> {
    return this.getJson<SwapQuoteResponse>("/swap/price", swapParams(params, false));
  }

  async swapQuote(params: SwapApiParams & { taker: string }): Promise<SwapQuoteResponse> {
    return this.getJson<SwapQuoteResponse>("/swap/quote", swapParams(params, true));
  }

  async swapTokens(chainId: number): Promise<TokenListEntry[]> {
    const data = await this.getJson<{ tokens?: TokenListEntry[] }>("/swap/token-list", {
      chainId: String(chainId),
    });
    return Array.isArray(data.tokens) ? data.tokens : [];
  }

  async bridgeQuote(params: BridgeQuoteParams): Promise<BungeeQuoteResponse> {
    return this.getJson<BungeeQuoteResponse>("/bridge/quote", {
      userAddress: params.userAddress,
      receiverAddress: params.receiverAddress ?? params.userAddress,
      originChainId: String(params.originChainId),
      destinationChainId: String(params.destinationChainId),
      inputToken: params.inputToken,
      outputToken: params.outputToken,
      inputAmount: params.inputAmount,
      ...(params.slippage === undefined ? {} : { slippage: String(params.slippage) }),
    });
  }

  async bridgeBuildTx(quoteId: string): Promise<BungeeBuildTxResponse> {
    return this.getJson<BungeeBuildTxResponse>("/bridge/build-tx", { quoteId });
  }

  async bridgeStatus(params: { requestHash?: string; txHash?: string }): Promise<BridgeStatusResponse> {
    return this.getJson<BridgeStatusResponse>("/bridge/status", {
      ...(params.requestHash ? { requestHash: params.requestHash } : {}),
      ...(params.txHash ? { txHash: params.txHash } : {}),
    });
  }

  async bridgeTokens(chainId: number): Promise<TokenListEntry[]> {
    const data = await this.getJson<{ result?: Record<string, TokenListEntry[]> }>("/bridge/tokens", {
      chainId: String(chainId),
    });
    return data.result?.[String(chainId)] ?? [];
  }

  private async getJson<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    const data = parseResponseText(text);
    if (!response.ok) {
      throw new Error(apiErrorMessage(data, response.status));
    }
    return data as T;
  }
}

export function normalizeApiBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("WalletChan API base URL must use http or https");
  }
  return parsed.toString().replace(/\/$/, "");
}

function swapParams(params: SwapApiParams, requireTaker: boolean): Record<string, string> {
  if (requireTaker && !params.taker) {
    throw new Error("Swap quote requires taker");
  }
  return {
    chainId: String(params.chainId),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    ...(params.taker ? { taker: params.taker } : {}),
    ...(params.recipient ? { recipient: params.recipient } : {}),
    ...(params.slippageBps === undefined ? {} : { slippageBps: String(params.slippageBps) }),
  };
}

function parseResponseText(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function apiErrorMessage(data: unknown, status: number): string {
  if (isRecord(data)) {
    const error = typeof data.error === "string" ? data.error : null;
    const reason = typeof data.reason === "string" ? data.reason : null;
    if (error || reason) return error || reason || `WalletChan API error ${status}`;
  }
  return `WalletChan API error ${status}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
