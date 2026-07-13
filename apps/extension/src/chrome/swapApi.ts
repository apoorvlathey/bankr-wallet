/** Stable compatibility facade for the independently auditable swap domain. */
export {
  DEFAULT_SLIPPAGE_BPS,
  NATIVE_TOKEN_ADDRESS,
  SLIPPAGE_PRESETS,
} from "./swap/constants";
export {
  buildApprovalTx,
  checkTokenAllowance,
  getTokenBalanceWei,
} from "./swap/erc20";
export { buildPermit2ApproveTx, checkPermit2Allowance } from "./swap/permit2";
export { fetchSwapPrice, fetchSwapQuote } from "./swap/quotes";
export { fetchTokenInfo } from "./swap/tokenInfo";
export { getCachedTokenList } from "./swap/tokenList";
export { getCachedTokenLogo } from "./swap/tokenLogo";
export { fetchTokenPrice } from "./swap/tokenPrice";
export type {
  SwapPriceParams,
  SwapQuoteParams,
  SwapQuoteResponse,
  TokenInfo,
  TokenListEntry,
} from "./swap/types";
