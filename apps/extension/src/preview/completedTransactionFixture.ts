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

export function getPreviewCompletedTransaction(
  scenario: string,
): CompletedTransaction {
  if (scenario === "pending") return previewPendingTransaction;
  if (scenario === "failed") return previewFailedTransaction;
  if (scenario === "missing-metadata") return previewMissingMetadataTransaction;
  if (scenario === "stress") return previewStressTransaction;
  return previewCompletedTransaction;
}
