export type PrivacyPoolsExplorerNetwork = "mainnet" | "sepolia";

export type PrivacyPoolsReviewStatus =
  | "pending"
  | "approved"
  | "declined"
  | "exited"
  | "spent"
  | "poi_required"
  | "not_seen";

export type PrivacyPoolsComplianceStatus =
  | "confirmed"
  | "pending"
  | "declined";

export interface PrivacyPoolsExplorerResult {
  network: PrivacyPoolsExplorerNetwork;
  chainId: number;
  chainName: string;
  checkedAt: string;
  txHash: string;
  explorerUrl: string;
  status: PrivacyPoolsComplianceStatus;
  deposit: {
    blockNumber: string;
    confirmedAt: string;
    depositor: string;
    amountWei: string;
    amountEth: string;
    commitment: string;
    label: string;
    precommitmentHash: string;
  };
  asp: {
    reviewStatus: PrivacyPoolsReviewStatus;
    exactDepositMatch: boolean;
    labelIncluded: boolean;
    root: string;
    rootCreatedAt: string;
  };
  onchain: {
    latestRoot: string;
    rootMatches: boolean;
    publishedAt: string | null;
    publisherTransactionHash: string | null;
    publisherTransactionUrl: string | null;
    verificationLatencySeconds: number | null;
  };
}


