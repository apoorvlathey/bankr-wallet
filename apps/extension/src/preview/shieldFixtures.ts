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
  const pendingEligibility = scenario === "pending-eligibility";
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
      confirmedBalanceWei: pendingEligibility ? "1980000000000000" : "0",
      readyBalanceWei: "0",
      pendingBalanceWei: pendingEligibility ? "1980000000000000" : "0",
      recoverableBalanceWei: pendingEligibility ? "1980000000000000" : "0",
      attentionCount: 0,
      lastUpdatedAt: PREVIEW_EPOCH_MS,
    },
  };
}
