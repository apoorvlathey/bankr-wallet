import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";
import { privacyShieldGrossAmountWei } from "@/lib/privacyShieldAmounts";
import { PREVIEW_EPOCH_MS } from "./fixtures";

const previewPendingShieldedWei =
  PRIVACY_POOLS_DEPLOYMENT.assetConfig.minimumDepositAmount;
const previewPendingGrossWei = privacyShieldGrossAmountWei(
  previewPendingShieldedWei,
  PRIVACY_POOLS_DEPLOYMENT.assetConfig.vettingFeeBPS,
);
const previewPendingProtocolFeeWei =
  previewPendingGrossWei - previewPendingShieldedWei;
const previewPendingGasReserveWei = 120_000_000_000_000n;

interface PreviewShieldAccount {
  id: string;
  address: string;
  type: "bankr" | "privateKey" | "seedPhrase" | "ledger";
}

export function previewShieldPortfolioResponse(
  scenario = "default",
  account: PreviewShieldAccount = {
    id: "preview-pk",
    address: "0x1234567890123456789012345678901234567890",
    type: "privateKey",
  },
) {
  const pendingEligibility = scenario === "pending-eligibility" || scenario === "unshield-pending" || scenario === "private";
  const readyToUnshield = scenario === "unshield" || scenario === "private";
  const readyBalanceWei = readyToUnshield ? 10_000_000_000_000_000n : 0n;
  const pendingBalanceWei = pendingEligibility ? previewPendingShieldedWei : 0n;
  return {
    success: true,
    operations: pendingEligibility
      ? [{
          id: "00000000-0000-4000-8000-000000000201",
          revision: 4,
          state: "awaiting_asp",
          createdAt: PREVIEW_EPOCH_MS - 90_000,
          chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
          accountId: account.id,
          accountAddress: account.address,
          accountType: account.type,
          amountWei: previewPendingGrossWei.toString(),
          protocolFeeWei: previewPendingProtocolFeeWei.toString(),
          shieldedAmountWei: previewPendingShieldedWei.toString(),
          gasReserveWei: previewPendingGasReserveWei.toString(),
          totalRequiredWei:
            (previewPendingGrossWei + previewPendingGasReserveWei).toString(),
          destinationAddress:
            PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
          poolAddress: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
          txHash: `0x${"ab".repeat(32)}`,
          blockNumber: PRIVACY_POOLS_DEPLOYMENT.observedAt.blockNumber.toString(),
          errorCode: null,
        }]
      : [],
    withdrawals: [],
    recoveries: [],
    portfolio: {
      status: "ready",
      confirmedBalanceWei: (readyBalanceWei + pendingBalanceWei).toString(),
      readyBalanceWei: readyBalanceWei.toString(),
      maxPrivateSendWei: readyToUnshield ? "10000000000000000" : "0",
      pendingBalanceWei: pendingBalanceWei.toString(),
      recoverableBalanceWei: pendingEligibility
        ? previewPendingShieldedWei.toString()
        : "0",
      attentionCount: 0,
      lastUpdatedAt: PREVIEW_EPOCH_MS,
    },
    series: {
      priceUsd: 3_420,
      totalValueUsd: readyToUnshield ? 34.2 : 0,
      snapshots: [
        { timestamp: PREVIEW_EPOCH_MS - 3_600_000, totalValueUsd: 0 },
        { timestamp: PREVIEW_EPOCH_MS, totalValueUsd: readyToUnshield ? 34.2 : 0 },
      ],
    },
  };
}
