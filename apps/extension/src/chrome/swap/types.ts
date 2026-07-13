export interface SwapQuoteResponse {
  buyAmount: string;
  sellAmount: string;
  buyToken: string;
  sellToken: string;
  gas: string;
  gasPrice: string;
  totalNetworkFee: string;
  liquidityAvailable: boolean;
  minBuyAmount: string;
  allowanceTarget: string;
  issues: {
    allowance?: {
      spender: string;
      actual: string;
      expected: string;
    };
    balance?: {
      token: string;
      actual: string;
      expected: string;
    };
    permit2Approval?: {
      token: string;
      spender: string;
    };
  };
  fees: {
    integratorFee?: {
      amount: string;
      token: string;
      type: string;
    };
    zeroExFee?: {
      amount: string;
      token: string;
      type: string;
    };
  };
  route: {
    fills: Array<{
      from: string;
      to: string;
      source: string;
      proportionBps: string;
    }>;
  };
  transaction?: {
    to: string;
    data: string;
    value: string;
    gas: string;
    /** Optional: 0x sets this; the custom WCHAN route omits it. */
    gasPrice?: string;
  };
  /** True when the taker qualifies for reduced premium fees (sWCHAN staker). */
  isPremiumFee?: boolean;
}

export interface SwapPriceParams {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker?: string;
  slippageBps?: number;
}

export interface SwapQuoteParams {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  slippageBps?: number;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
}

export interface TokenListEntry {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}
