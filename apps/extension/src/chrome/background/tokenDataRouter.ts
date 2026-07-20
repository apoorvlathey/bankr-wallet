/** Trusted-UI transport for token metadata, storage, prices, and balances. */

export const BACKGROUND_TOKEN_DATA_MESSAGE_TYPES = [
  "fetchTokenInfo",
  "resolveTokenMetadata",
  "lookupCustomToken",
  "addCustomToken",
  "updateCustomToken",
  "removeCustomToken",
  "fetchTokenPrice",
  "fetchNativePrice",
  "cacheAvatarImage",
  "resolveCoinGeckoNativeAssets",
  "resolveCoinGeckoErc20Prices",
  "fetchTokenLogo",
  "checkTokenAllowance",
  "getTokenBalanceWei",
  "checkPermit2Allowance",
  "getWchanStakingState",
  "getWchanVaultApy",
] as const;

export type BackgroundTokenDataRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type CustomToken = {
  chainId: number;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  image?: string;
};

type Dependencies = {
  isTrustedWalletUiSender: (sender: chrome.runtime.MessageSender) => boolean;
  fetchTokenInfo: (tokenAddress: string, chainId: number) => Promise<any>;
  resolveTokenMetadata: (
    chainId: number,
    tokenAddress: string,
    options: { includeBungeeTokens: boolean },
  ) => Promise<any>;
  getCustomTokens: () => Promise<CustomToken[]>;
  addCustomToken: (token: CustomToken) => Promise<void>;
  updateCustomToken: (
    chainId: number,
    contractAddress: string,
    updates: Partial<Pick<CustomToken, "name" | "symbol" | "decimals" | "image">>,
  ) => Promise<void>;
  removeCustomToken: (
    chainId: number,
    contractAddress: string,
  ) => Promise<void>;
  fetchTokenPrice: (chainId: number, address: string) => Promise<any>;
  fetchNativePrice: (chainId: number) => Promise<any>;
  fetchAndCacheAvatarImage: (url: string) => Promise<string | null>;
  resolveCoinGeckoNativeAssetsBatch: (requests: any) => Promise<any>;
  resolveCoinGeckoErc20PricesBatch: (requests: any) => Promise<any>;
  resolveTokenLogoUrl: (
    chainId: number,
    tokenAddress: string,
  ) => Promise<string | null>;
  checkTokenAllowance: (...args: any[]) => Promise<bigint>;
  getTokenBalanceWei: (...args: any[]) => Promise<bigint>;
  checkPermit2Allowance: (...args: any[]) => Promise<{
    amount: bigint;
    expiration: number;
  }>;
  getWchanStakingState: (...args: any[]) => Promise<any>;
  fetchWchanVaultApy: () => Promise<any>;
};

const HANDLED_ASYNC: BackgroundTokenDataRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_SYNC: BackgroundTokenDataRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

function promiseError(error: any): { success: false; error: unknown } {
  return { success: false, error: error?.message };
}

function caughtError(error: unknown): { success: false; error: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

function respondWithData(
  request: Promise<any>,
  sendResponse: (response?: any) => void,
): void {
  request
    .then((data) => sendResponse({ success: true, data }))
    .catch((error) => sendResponse(promiseError(error)));
}

async function lookupCustomToken(
  message: any,
  dependencies: Dependencies,
): Promise<any> {
  try {
    const tokens = await dependencies.getCustomTokens();
    const address = String(message.tokenAddress || "").toLowerCase();
    const match = tokens.find(
      (token) =>
        token.chainId === Number(message.chainId) &&
        token.contractAddress === address,
    );
    return { success: true, data: match || null };
  } catch (error) {
    return caughtError(error);
  }
}

async function addCustomToken(
  message: any,
  dependencies: Dependencies,
): Promise<any> {
  try {
    const token: CustomToken = {
      chainId: Number(message.chainId),
      contractAddress: String(message.contractAddress || ""),
      symbol: String(message.symbol || ""),
      name: String(message.name || ""),
      decimals: Number(message.decimals),
    };
    if (typeof message.image === "string") token.image = message.image;
    await dependencies.addCustomToken(token);
    return { success: true };
  } catch (error) {
    return caughtError(error);
  }
}

async function updateCustomToken(
  message: any,
  dependencies: Dependencies,
): Promise<any> {
  try {
    const updates: Partial<CustomToken> = {};
    if ("name" in message) updates.name = String(message.name || "");
    if ("symbol" in message) updates.symbol = String(message.symbol || "");
    if ("decimals" in message) updates.decimals = Number(message.decimals);
    if ("image" in message && typeof message.image === "string") {
      updates.image = message.image;
    }
    await dependencies.updateCustomToken(
      Number(message.chainId),
      String(message.contractAddress || ""),
      updates,
    );
    return { success: true };
  } catch (error) {
    return caughtError(error);
  }
}

async function removeCustomToken(
  message: any,
  dependencies: Dependencies,
): Promise<any> {
  try {
    await dependencies.removeCustomToken(
      Number(message.chainId),
      String(message.contractAddress || ""),
    );
    return { success: true };
  } catch (error) {
    return caughtError(error);
  }
}

export function createBackgroundTokenDataMessageRouter(
  dependencies: Dependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => BackgroundTokenDataRouteResult {
  return (message, sender, sendResponse) => {
    switch (message?.type) {
      case "fetchTokenInfo":
        respondWithData(
          dependencies.fetchTokenInfo(message.tokenAddress, message.chainId),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "resolveTokenMetadata":
        respondWithData(
          dependencies.resolveTokenMetadata(
            message.chainId,
            String(message.tokenAddress || ""),
            { includeBungeeTokens: message.includeBungeeTokens !== false },
          ),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "lookupCustomToken":
        void lookupCustomToken(message, dependencies).then(sendResponse);
        return HANDLED_ASYNC;

      case "addCustomToken":
        void addCustomToken(message, dependencies).then(sendResponse);
        return HANDLED_ASYNC;

      case "updateCustomToken":
        void updateCustomToken(message, dependencies).then(sendResponse);
        return HANDLED_ASYNC;

      case "removeCustomToken":
        void removeCustomToken(message, dependencies).then(sendResponse);
        return HANDLED_ASYNC;

      case "fetchTokenPrice":
        dependencies
          .fetchTokenPrice(message.chainId, message.address)
          .then((priceUsd) => sendResponse({ success: true, priceUsd }))
          .catch((error) => sendResponse(promiseError(error)));
        return HANDLED_ASYNC;

      case "fetchNativePrice":
        dependencies
          .fetchNativePrice(message.chainId)
          .then((priceUsd) =>
            sendResponse({ success: true, priceUsd: priceUsd ?? 0 }),
          )
          .catch((error) => sendResponse(promiseError(error)));
        return HANDLED_ASYNC;

      case "cacheAvatarImage": {
        if (!dependencies.isTrustedWalletUiSender(sender)) {
          sendResponse({ dataUrl: null });
          return HANDLED_SYNC;
        }
        const url = typeof message.url === "string" ? message.url : "";
        if (!url) {
          sendResponse({ dataUrl: null });
          return HANDLED_SYNC;
        }
        dependencies
          .fetchAndCacheAvatarImage(url)
          .then((dataUrl) => sendResponse({ dataUrl }))
          .catch(() => sendResponse({ dataUrl: null }));
        return HANDLED_ASYNC;
      }

      case "resolveCoinGeckoNativeAssets":
        respondWithData(
          dependencies.resolveCoinGeckoNativeAssetsBatch(message.requests),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "resolveCoinGeckoErc20Prices":
        respondWithData(
          dependencies.resolveCoinGeckoErc20PricesBatch(message.requests),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "fetchTokenLogo":
        dependencies
          .resolveTokenLogoUrl(
            message.chainId,
            String(message.tokenAddress || ""),
          )
          .then((logoUrl) => sendResponse({ success: true, logoUrl }))
          .catch((error) => sendResponse(promiseError(error)));
        return HANDLED_ASYNC;

      case "checkTokenAllowance":
        dependencies
          .checkTokenAllowance(
            message.tokenAddress,
            message.owner,
            message.spender,
            message.chainId,
          )
          .then((allowance) =>
            sendResponse({ success: true, allowance: allowance.toString() }),
          )
          .catch((error) => sendResponse(promiseError(error)));
        return HANDLED_ASYNC;

      case "getTokenBalanceWei":
        dependencies
          .getTokenBalanceWei(
            message.tokenAddress,
            message.owner,
            message.chainId,
          )
          .then((balance) =>
            sendResponse({ success: true, balance: balance.toString() }),
          )
          .catch((error) => sendResponse(promiseError(error)));
        return HANDLED_ASYNC;

      case "checkPermit2Allowance":
        dependencies
          .checkPermit2Allowance(
            message.token,
            message.owner,
            message.spender,
            message.chainId,
          )
          .then(({ amount, expiration }) =>
            sendResponse({
              success: true,
              amount: amount.toString(),
              expiration,
            }),
          )
          .catch((error) => sendResponse(promiseError(error)));
        return HANDLED_ASYNC;

      case "getWchanStakingState":
        respondWithData(
          dependencies.getWchanStakingState({
            owner: message.owner,
            previewMode: message.previewMode,
            previewAmount: message.previewAmount,
          }),
          sendResponse,
        );
        return HANDLED_ASYNC;

      case "getWchanVaultApy":
        dependencies
          .fetchWchanVaultApy()
          .then((data) => sendResponse({ success: true, data }))
          .catch((error) => sendResponse(promiseError(error)));
        return HANDLED_ASYNC;

      default:
        return { handled: false };
    }
  };
}
