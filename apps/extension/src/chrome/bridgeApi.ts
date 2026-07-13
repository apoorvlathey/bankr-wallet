/** Stable WalletChan bridge API and catalog compatibility facade. */

export {
  fetchBridgeQuote,
  fetchBridgeStatus,
  type BridgeQuoteParams,
  type BridgeStatusParams,
} from "./bridge/client";
export {
  getCachedBungeeChains,
  getCachedBungeeTokens,
  isNativeToken,
} from "./bridge/catalogCache";
