import { PREVIEW_EPOCH_MS } from "./fixtures";

interface PreviewShieldAccount {
  id: string;
  address: string;
  type: "bankr" | "privateKey" | "seedPhrase";
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
  const readyToSend = scenario === "unshield" || scenario === "send" || scenario === "private";
  const readyBalanceWei = readyToSend ? 10_000_000_000_000_000n : 0n;
  const pendingBalanceWei = pendingEligibility ? 1_980_000_000_000_000n : 0n;
  return {
    success: true,
    operations: pendingEligibility
      ? [{
          id: "00000000-0000-4000-8000-000000000201",
          revision: 4,
          state: "awaiting_asp",
          createdAt: PREVIEW_EPOCH_MS - 90_000,
          chainId: 11_155_111,
          accountId: account.id,
          accountAddress: account.address,
          accountType: account.type,
          amountWei: "2000000000000000",
          protocolFeeWei: "20000000000000",
          shieldedAmountWei: "1980000000000000",
          gasReserveWei: "120000000000000",
          totalRequiredWei: "2120000000000000",
          destinationAddress: "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
          poolAddress: "0x644d5A2554d36e27509254F32ccfeBe8cd58861f",
          txHash: `0x${"ab".repeat(32)}`,
          blockNumber: "11305183",
          errorCode: null,
        }]
      : [],
    withdrawals: [],
    recoveries: [],
    portfolio: {
      status: "ready",
      confirmedBalanceWei: (readyBalanceWei + pendingBalanceWei).toString(),
      readyBalanceWei: readyBalanceWei.toString(),
      maxPrivateSendWei: readyToSend ? "10000000000000000" : "0",
      pendingBalanceWei: pendingBalanceWei.toString(),
      recoverableBalanceWei: pendingEligibility ? "1980000000000000" : "0",
      attentionCount: 0,
      lastUpdatedAt: PREVIEW_EPOCH_MS,
    },
    series: {
      priceUsd: 3_420,
      totalValueUsd: readyToSend ? 34.2 : 0,
      snapshots: [
        { timestamp: PREVIEW_EPOCH_MS - 3_600_000, totalValueUsd: 0 },
        { timestamp: PREVIEW_EPOCH_MS, totalValueUsd: readyToSend ? 34.2 : 0 },
      ],
    },
  };
}
