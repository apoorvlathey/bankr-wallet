import type { TransferAccountType } from "../types";

const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Keep the sponsored-transfer implementation available, but route Base USDC
// through the standard ERC-20 transfer flow until sponsorship is re-enabled.
export const SPONSORED_BASE_USDC_SENDS_ENABLED = false;

interface TokenIdentity {
  chainId: number;
  contractAddress?: string | null;
}

interface PremiumStatus {
  isPremium: boolean;
  sponsoredTransfersEnabled: boolean;
}

export function isSponsoredBaseUsdcCandidate(
  token: TokenIdentity | null,
): boolean {
  return Boolean(
    SPONSORED_BASE_USDC_SENDS_ENABLED &&
      token &&
      token.chainId === 8453 &&
      token.contractAddress?.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase(),
  );
}

export function shouldUseSponsoredTransfer({
  isCandidate,
  premiumStatus,
  accountType,
}: {
  isCandidate: boolean;
  premiumStatus: PremiumStatus | null;
  accountType: TransferAccountType;
}): boolean {
  return Boolean(
    isCandidate &&
      premiumStatus?.isPremium &&
      premiumStatus.sponsoredTransfersEnabled &&
      accountType !== "impersonator" &&
      accountType !== "ledger" &&
      accountType !== "safe",
  );
}
