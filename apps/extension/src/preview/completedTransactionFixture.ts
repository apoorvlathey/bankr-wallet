import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import {
  PREVIEW_EPOCH_MS,
  PREVIEW_WALLETS,
} from "./fixtures";
import { previewAssets } from "./previewAssets";

const previewAavePool = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";

const supplyData =
  "0x617ba037" +
  "833589fcd6edb6e08f4c7c32d4f71b54bda02913".padStart(64, "0") +
  BigInt(1_000_000).toString(16).padStart(64, "0") +
  PREVIEW_WALLETS.privateKey.address
    .toLowerCase()
    .replace("0x", "")
    .padStart(64, "0") +
  "0".padStart(64, "0");

export const previewCompletedTransaction: CompletedTransaction = {
  id: "preview-completed-supply",
  status: "success",
  tx: {
    from: PREVIEW_WALLETS.privateKey.address,
    to: previewAavePool,
    data: supplyData,
    value: "0x0",
    chainId: 8453,
  },
  origin: "https://app.aave.com",
  favicon: previewAssets.dapps.aave,
  chainName: "Base",
  chainId: 8453,
  createdAt: PREVIEW_EPOCH_MS - 90_000,
  completedAt: PREVIEW_EPOCH_MS - 60_000,
  txHash:
    "0x9d842ed9a61f8e49a1d5ab5f8c0db21e8a2be15be38d1dde7c47b9f1205b78a1",
  accountType: "privateKey",
  functionName: "supply",
  gasData: {
    gasUsed: "182450",
    gasLimit: "220000",
    effectiveGasPrice: "61000000",
    l1Fee: "420000000000",
  },
  clearSignedMeta: {
    kind: "erc7730",
    intent: "Supply 1 USDC to Aave",
    contractName: "Aave Pool",
    counterparty: previewAavePool,
    counterpartyLabel: "Aave Pool",
  },
  assetChanges: {
    blockNumber: "31245001",
    nativeDelta: "0",
    erc20Transfers: [
      {
        token: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        direction: "out",
        counterparty: previewAavePool.toLowerCase(),
        amountWei: "1000000",
        symbol: "USDC",
        decimals: 6,
        logoUrl: previewAssets.tokens.usdc,
      },
      {
        token: "0x4e65fe4dba92790696d040ac24aa414708f5c0ab",
        direction: "in",
        counterparty: "0x0000000000000000000000000000000000000000",
        amountWei: "1000003",
        symbol: "aBasUSDC",
        decimals: 6,
        logoUrl: previewAssets.tokens.usdc,
      },
    ],
  },
  accountId: PREVIEW_WALLETS.privateKey.accountId,
};

export const previewPendingTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-pending-supply",
  status: "pending",
  completedAt: undefined,
  assetChanges: undefined,
};

export const previewFailedTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-failed-supply",
  status: "failed",
  completedAt: PREVIEW_EPOCH_MS - 45_000,
  error: "Transaction reverted while supplying collateral.",
  assetChanges: undefined,
};

export const previewMissingMetadataTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-missing-metadata",
  clearSignedMeta: undefined,
  assetChanges: {
    ...previewCompletedTransaction.assetChanges!,
    erc20Transfers: previewCompletedTransaction.assetChanges!.erc20Transfers.map(
      (transfer) => ({
        ...transfer,
        symbol: undefined,
        decimals: undefined,
        logoUrl: undefined,
      }),
    ),
  },
};

export const previewStressTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-stress-transaction",
  assetChanges: {
    ...previewCompletedTransaction.assetChanges!,
    erc20Transfers: Array.from({ length: 8 }, (_, index) => ({
      ...previewCompletedTransaction.assetChanges!.erc20Transfers[
        index % previewCompletedTransaction.assetChanges!.erc20Transfers.length
      ],
      token: `0x${String(index + 1).padStart(40, "0")}`,
      amountWei: String(1_000_000 + index * 123_456),
      symbol: `TOKEN${index + 1}`,
    })),
  },
};

export function getPreviewActivityTransactions(): CompletedTransaction[] {
  const shared = {
    ...previewCompletedTransaction,
    clearSignedMeta: undefined,
    assetChanges: undefined,
    destAssetChanges: undefined,
    completedAt: undefined,
    error: undefined,
    bridge: undefined,
    swapMeta: undefined,
    transferMeta: undefined,
    batchCallOrigins: undefined,
    functionName: undefined,
  } satisfies CompletedTransaction;

  return [
    {
      ...shared,
      id: "preview-activity-send",
      status: "success",
      origin: "WalletChan",
      favicon: previewAssets.brand.walletChan,
      chainName: "Base",
      chainId: 8453,
      createdAt: PREVIEW_EPOCH_MS - 30 * 60_000,
      completedAt: PREVIEW_EPOCH_MS - 29 * 60_000,
      transferMeta: {
        recipient: "0xb06a00000000000000000000000000000000dac2",
        amount: "0.0000001234",
        symbol: "ETH",
        tokenLogo: previewAssets.chains.ethereum,
      },
    },
    {
      ...shared,
      id: "preview-activity-swap-pending",
      status: "pending",
      origin: "https://app.uniswap.org",
      favicon: previewAssets.dapps.uniswap,
      createdAt: PREVIEW_EPOCH_MS - 90 * 60_000,
      txHash:
        "0x1d842ed9a61f8e49a1d5ab5f8c0db21e8a2be15be38d1dde7c47b9f1205b78a1",
      swapMeta: {
        sellTokenSymbol: "USDC",
        sellTokenLogo: previewAssets.tokens.usdc,
        buyTokenSymbol: "ETH",
        buyTokenLogo: previewAssets.chains.ethereum,
      },
    },
    {
      ...shared,
      id: "preview-activity-batch",
      status: "success",
      origin: "https://swap.defillama.com",
      favicon: previewAssets.dapps.aave,
      createdAt: PREVIEW_EPOCH_MS - 26 * 60 * 60_000,
      completedAt: PREVIEW_EPOCH_MS - 26 * 60 * 60_000 + 45_000,
      functionName: "Batch: approve, swap",
      batchCallOrigins: [
        { origin: "https://swap.defillama.com", favicon: previewAssets.dapps.aave },
        { origin: "https://app.uniswap.org", favicon: previewAssets.dapps.uniswap },
      ],
    },
    {
      ...shared,
      id: "preview-activity-bridge",
      status: "success",
      origin: "Bridge USDC → Polygon",
      favicon: previewAssets.brand.walletChan,
      createdAt: PREVIEW_EPOCH_MS - 3 * 24 * 60 * 60_000,
      completedAt: PREVIEW_EPOCH_MS - 3 * 24 * 60 * 60_000 + 90_000,
      swapMeta: {
        sellTokenSymbol: "USDC",
        sellTokenLogo: previewAssets.tokens.usdc,
        buyTokenSymbol: "USDC",
        buyTokenLogo: previewAssets.tokens.usdc,
      },
      bridge: {
        sourceChainId: 8453,
        sourceTxHash:
          "0x2d842ed9a61f8e49a1d5ab5f8c0db21e8a2be15be38d1dde7c47b9f1205b78a1",
        destinationChainId: 137,
        destinationChainName: "Polygon",
        destinationTxHash:
          "0x3d842ed9a61f8e49a1d5ab5f8c0db21e8a2be15be38d1dde7c47b9f1205b78a1",
        bungeeStatusCode: 3,
        routeName: "Socket",
      },
    },
    {
      ...shared,
      id: "preview-activity-name",
      status: "success",
      origin: "https://gwei.domains",
      favicon: previewAssets.dapps.aave,
      chainName: "Ethereum",
      chainId: 1,
      createdAt: PREVIEW_EPOCH_MS - 5 * 24 * 60 * 60_000,
      completedAt: PREVIEW_EPOCH_MS - 5 * 24 * 60 * 60_000 + 60_000,
      functionName: "setPrimaryName",
    },
    {
      ...shared,
      id: "preview-activity-failed",
      status: "failed",
      origin: "https://app.uniswap.org",
      favicon: previewAssets.dapps.uniswap,
      createdAt: PREVIEW_EPOCH_MS - 5 * 24 * 60 * 60_000 - 90 * 60_000,
      completedAt: PREVIEW_EPOCH_MS - 5 * 24 * 60 * 60_000 - 89 * 60_000,
      functionName: "execute",
      error: "Transaction reverted during execution.",
    },
    {
      ...shared,
      id: "preview-activity-fallback-swap",
      status: "success",
      origin: "https://app.uniswap.org",
      favicon: previewAssets.dapps.uniswap,
      createdAt: PREVIEW_EPOCH_MS - 6 * 24 * 60 * 60_000,
      completedAt: PREVIEW_EPOCH_MS - 6 * 24 * 60 * 60_000 + 60_000,
      swapMeta: {
        sellTokenSymbol: "BUILD",
        sellTokenLogo:
          "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
        buyTokenSymbol: "USDC",
        buyTokenLogo: previewAssets.tokens.usdc,
      },
    },
  ];
}

export function getPreviewCompletedTransaction(
  scenario: string,
): CompletedTransaction {
  if (scenario === "pending") return previewPendingTransaction;
  if (scenario === "failed") return previewFailedTransaction;
  if (scenario === "missing-metadata") return previewMissingMetadataTransaction;
  if (scenario === "stress") return previewStressTransaction;
  return previewCompletedTransaction;
}
