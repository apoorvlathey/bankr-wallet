import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { previewAssets } from "./previewAssets";
import { previewCompletedTransaction } from "./completedTransactionFixture";

export const previewUsdcAddress =
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const previewRouterAddress =
  "0x111111125421ca6dc452d289314280a0f8842a65";

export const previewBridgeTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-completed-bridge",
  tx: {
    ...previewCompletedTransaction.tx,
    to: "0x0000000000000000000000000000000000000782",
    data: "0x",
  },
  origin: "WalletChan",
  favicon: previewAssets.brand.walletChan,
  functionName: "bridge",
  clearSignedMeta: undefined,
  swapMeta: {
    sellTokenSymbol: "USDC",
    sellTokenLogo: previewAssets.tokens.usdc,
    buyTokenSymbol: "USDC",
    buyTokenLogo: previewAssets.tokens.usdc,
  },
  bridge: {
    sourceChainId: 8453,
    sourceTxHash: previewCompletedTransaction.txHash,
    destinationChainId: 137,
    destinationChainName: "Polygon",
    destinationTxHash:
      "0x3d842ed9a61f8e49a1d5ab5f8c0db21e8a2be15be38d1dde7c47b9f1205b78a1",
    bungeeStatusCode: 4,
    routeName: "Socket",
  },
  assetChanges: {
    blockNumber: "31245001",
    nativeDelta: "0",
    erc20Transfers: [
      {
        token: previewUsdcAddress,
        direction: "out",
        counterparty: "0x0000000000000000000000000000000000000782",
        amountWei: "25000000",
        symbol: "USDC",
        decimals: 6,
        logoUrl: previewAssets.tokens.usdc,
      },
    ],
  },
  destAssetChanges: {
    blockNumber: "73124001",
    nativeDelta: "0",
    erc20Transfers: [
      {
        token: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
        direction: "in",
        counterparty: "0x0000000000000000000000000000000000000782",
        amountWei: "24987000",
        symbol: "USDC",
        decimals: 6,
        logoUrl: previewAssets.tokens.usdc,
      },
    ],
  },
};

export const previewApprovalTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-completed-approval",
  tx: {
    ...previewCompletedTransaction.tx,
    to: previewUsdcAddress,
    data:
      "0x095ea7b3" +
      "111111125421ca6dc452d289314280a0f8842a65".padStart(64, "0") +
      "f".repeat(64),
  },
  origin: "https://app.uniswap.org",
  favicon: previewAssets.dapps.uniswap,
  functionName: "approve",
  assetChanges: undefined,
  clearSignedMeta: {
    kind: "approve",
    amount: "unlimited",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    tokenLogo: previewAssets.tokens.usdc,
    tokenAddress: previewUsdcAddress,
    isInfinite: true,
    counterparty: "0x111111125421cA6dc452d289314280a0f8842A65",
    counterpartyLabel: "1inch Router",
  },
};

export const previewTransferTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-completed-transfer",
  tx: {
    ...previewCompletedTransaction.tx,
    to: "0xb06a00000000000000000000000000000000dac2",
    data: "0x",
    value: "10000000000000000",
  },
  origin: "WalletChan",
  favicon: previewAssets.brand.walletChan,
  functionName: undefined,
  transferMeta: {
    recipient: "0xb06a00000000000000000000000000000000dac2",
    amount: "0.01",
    symbol: "ETH",
    tokenLogo: previewAssets.chains.ethereum,
  },
  assetChanges: {
    blockNumber: "31245001",
    nativeDelta: "-10000000000000000",
    erc20Transfers: [],
  },
  clearSignedMeta: {
    kind: "nativeSend",
    amount: "0.01",
    tokenSymbol: "ETH",
    tokenLogo: previewAssets.chains.ethereum,
    counterparty: "0xb06a00000000000000000000000000000000dac2",
    counterpartyLabel: "Dev",
  },
};

export const previewErc20TransferTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-completed-erc20-transfer",
  tx: {
    ...previewCompletedTransaction.tx,
    to: previewUsdcAddress,
    data:
      "0xa9059cbb" +
      "b06a00000000000000000000000000000000dac2".padStart(64, "0") +
      BigInt(5_000_000).toString(16).padStart(64, "0"),
    value: "0x0",
  },
  origin: "WalletChan",
  favicon: previewAssets.brand.walletChan,
  functionName: "transfer",
  clearSignedMeta: {
    kind: "transfer",
    amount: "5",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    tokenLogo: previewAssets.tokens.usdc,
    tokenAddress: previewUsdcAddress,
    counterparty: "0xb06a00000000000000000000000000000000dac2",
    counterpartyLabel: "Dev",
  },
  assetChanges: {
    blockNumber: "31245002",
    nativeDelta: "0",
    erc20Transfers: [
      {
        token: previewUsdcAddress,
        direction: "out",
        counterparty: "0xb06a00000000000000000000000000000000dac2",
        amountWei: "5000000",
        symbol: "USDC",
        decimals: 6,
        logoUrl: previewAssets.tokens.usdc,
      },
    ],
  },
};

export const previewApprovalRevokeTransaction: CompletedTransaction = {
  ...previewApprovalTransaction,
  id: "preview-completed-approval-revoke",
  clearSignedMeta: {
    ...previewApprovalTransaction.clearSignedMeta!,
    amount: "0",
    isInfinite: false,
    isRevoke: true,
  },
};

export const previewSwapTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-completed-swap",
  origin: "https://app.uniswap.org",
  favicon: previewAssets.dapps.uniswap,
  functionName: "execute",
  clearSignedMeta: undefined,
  swapMeta: {
    sellTokenSymbol: "USDC",
    sellTokenLogo: previewAssets.tokens.usdc,
    buyTokenSymbol: "ETH",
    buyTokenLogo: previewAssets.chains.ethereum,
  },
  assetChanges: {
    blockNumber: "31245003",
    nativeDelta: "1337000000000000",
    erc20Transfers: [
      {
        token: previewUsdcAddress,
        direction: "out",
        counterparty: previewRouterAddress,
        amountWei: "5000000",
        symbol: "USDC",
        decimals: 6,
        logoUrl: previewAssets.tokens.usdc,
      },
    ],
  },
};

export const previewPendingSwapTransaction: CompletedTransaction = {
  ...previewSwapTransaction,
  id: "preview-pending-swap",
  status: "pending",
  completedAt: undefined,
  assetChanges: undefined,
};
