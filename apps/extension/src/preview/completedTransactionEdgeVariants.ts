import { encodeBatchCalls } from "@/chrome/batch/batchTxEncoding";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { EIP_7702_DEFAULT_DELEGATE } from "@/constants/chainRegistry";
import { PREVIEW_EPOCH_MS, PREVIEW_WALLETS } from "./fixtures";
import { previewAssets } from "./previewAssets";
import { previewCompletedTransaction } from "./completedTransactionFixture";
import {
  previewApprovalTransaction,
  previewBridgeTransaction,
  previewRouterAddress,
  previewTransferTransaction,
  previewUsdcAddress,
} from "./completedTransactionCoreVariants";

const previewDelegateAddress = "0x1111111111111111111111111111111111111111";
const previewAtomicBatchTx = encodeBatchCalls(
  [
    {
      to: previewUsdcAddress,
      value: "0x0",
      data: (
        "0x095ea7b3" +
        previewRouterAddress.slice(2).padStart(64, "0") +
        BigInt(1_000_000).toString(16).padStart(64, "0")
      ) as `0x${string}`,
    },
    { to: previewRouterAddress, value: "0x0", data: "0x12345678" },
  ],
  PREVIEW_WALLETS.privateKey.address,
);

export const previewDelegationSetTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-delegation-set",
  tx: {
    ...previewCompletedTransaction.tx,
    to: PREVIEW_WALLETS.privateKey.address,
    data: "0x",
  },
  origin: "WalletChan",
  favicon: previewAssets.brand.walletChan,
  functionName: "setDelegate",
  clearSignedMeta: undefined,
  assetChanges: undefined,
  delegation7702Meta: {
    targetDelegate: EIP_7702_DEFAULT_DELEGATE,
    kind: "setDelegate",
  },
};

export const previewDelegationRevokeTransaction: CompletedTransaction = {
  ...previewDelegationSetTransaction,
  id: "preview-delegation-revoke",
  functionName: "revokeDelegate",
  delegation7702Meta: {
    targetDelegate: "0x0000000000000000000000000000000000000000",
    kind: "revoke",
  },
};

export const previewAtomicBatchTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-atomic-batch",
  tx: {
    ...previewCompletedTransaction.tx,
    to: previewAtomicBatchTx.to,
    data: previewAtomicBatchTx.data,
    value: previewAtomicBatchTx.value,
  },
  origin: "https://swap.defillama.com",
  favicon: previewAssets.dapps.aave,
  functionName: "Batch: approve, swap",
  clearSignedMeta: undefined,
  assetChanges: undefined,
  batchCallOrigins: [
    { origin: "https://swap.defillama.com", favicon: previewAssets.dapps.aave },
    { origin: "https://app.uniswap.org", favicon: previewAssets.dapps.uniswap },
  ],
};

export const previewSplitBatchTransaction: CompletedTransaction = {
  ...previewApprovalTransaction,
  id: "preview-split-batch-call",
  parentBundleId: "preview-sequential-bundle",
  bundleIndex: 1,
};

export const previewForceInclusionTransaction: CompletedTransaction = {
  ...previewTransferTransaction,
  id: "preview-force-inclusion-l1",
  status: "processing",
  completedAt: undefined,
  txHash:
    "0x4d842ed9a61f8e49a1d5ab5f8c0db21e8a2be15be38d1dde7c47b9f1205b78a1",
  forceInclusionMeta: {
    l1TxHash:
      "0x4d842ed9a61f8e49a1d5ab5f8c0db21e8a2be15be38d1dde7c47b9f1205b78a1",
    l1ChainId: 1,
    l2ChainId: 8453,
    l2Confirmed: false,
  },
  assetChanges: undefined,
};

export const previewForceInclusionCompleteTransaction: CompletedTransaction = {
  ...previewForceInclusionTransaction,
  id: "preview-force-inclusion-complete",
  status: "success",
  completedAt: PREVIEW_EPOCH_MS - 20_000,
  txHash:
    "0x5d842ed9a61f8e49a1d5ab5f8c0db21e8a2be15be38d1dde7c47b9f1205b78a1",
  forceInclusionMeta: {
    ...previewForceInclusionTransaction.forceInclusionMeta!,
    l2Confirmed: true,
  },
};

export const previewBridgePendingTransaction: CompletedTransaction = {
  ...previewBridgeTransaction,
  id: "preview-bridge-pending",
  status: "pending",
  completedAt: undefined,
  bridge: {
    ...previewBridgeTransaction.bridge!,
    destinationTxHash: undefined,
    bungeeStatusCode: 1,
  },
  destAssetChanges: undefined,
};

export const previewBridgeRefundedTransaction: CompletedTransaction = {
  ...previewBridgeTransaction,
  id: "preview-bridge-refunded",
  bridge: {
    ...previewBridgeTransaction.bridge!,
    destinationTxHash: undefined,
    bungeeStatusCode: 7,
    refundTxHash:
      "0x6d842ed9a61f8e49a1d5ab5f8c0db21e8a2be15be38d1dde7c47b9f1205b78a1",
  },
  destAssetChanges: undefined,
};

export const previewDeploymentTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-contract-deployment",
  tx: {
    ...previewCompletedTransaction.tx,
    to: null,
    data: "0x6080604052348015600f57600080fd5b506001600055",
    value: "0x0",
  },
  origin: "https://remix.ethereum.org",
  favicon: null,
  functionName: undefined,
  clearSignedMeta: undefined,
  assetChanges: undefined,
};

export const previewLegacyTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-legacy-contract-call",
  tx: {
    ...previewCompletedTransaction.tx,
    to: previewRouterAddress,
    data: "0xdeadbeef",
    value: "0x0",
  },
  functionName: undefined,
  clearSignedMeta: undefined,
  assetChanges: undefined,
};

export const previewBroadcastUncertainTransaction: CompletedTransaction = {
  ...previewLegacyTransaction,
  id: "preview-broadcast-uncertain",
  status: "processing",
  completedAt: undefined,
  broadcastUncertain: true,
};

export const previewErc7715RevokeTransaction: CompletedTransaction = {
  ...previewCompletedTransaction,
  id: "preview-erc7715-revoke",
  origin: "WalletChan",
  favicon: previewAssets.brand.walletChan,
  functionName: "disableDelegation",
  clearSignedMeta: undefined,
  assetChanges: undefined,
  erc7715PermissionRevokeMeta: {
    grantId: "preview-permission-grant",
    origin: "http://localhost:3030",
    permissionType: "erc20-token-periodic",
    delegate: previewDelegateAddress,
    tokenAddress: previewUsdcAddress,
    amount: "0xf4240",
    periodDuration: 86_400,
    expiresAt: 1_782_402_300,
  },
};
