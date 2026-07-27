import { previewAssets } from "./previewAssets";

const PREVIEW_BASE_USDC =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export function getPreviewFeePaymentOptions() {
  return {
    success: true,
    options: [
      {
        id: "native",
        symbol: "ETH",
        decimals: 18,
        available: true,
      },
      {
        id: PREVIEW_BASE_USDC,
        symbol: "USDC",
        decimals: 6,
        available: true,
        balance: "321123000",
        stablecoin: true,
        logoUrl: previewAssets.tokens.usdc,
      },
    ],
  };
}

export function getPreviewFeePaymentQuote() {
  return {
    success: true,
    quoteId: "preview-base-usdc-fee-quote",
    tokenId: PREVIEW_BASE_USDC,
    tokenAddress: PREVIEW_BASE_USDC,
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    tokenStablecoin: true,
    maximumTokenCost: "120000",
    tokenBalance: "321123000",
    expiresAt: Date.now() + 60_000,
    approvalAdded: false,
    approvalAmount: null,
    paymaster: "0x1111111111111111111111111111111111111111",
    userOperationNonce: "0x0",
    sufficientBalance: true,
    needsAuthorization: false,
  };
}
