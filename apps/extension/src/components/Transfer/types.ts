import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { Account } from "@/chrome/types";

export type TransferAccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "impersonator";

export interface TokenTransferProps {
  token?: PortfolioToken | null;
  fromAddress: string;
  chainId: number;
  accountType: TransferAccountType;
  accounts?: Account[];
  onBack: () => void;
  onTransferInitiated: (sponsored?: boolean) => void;
}

export interface SponsoredTransferFailure {
  message: string;
  outcomeUncertain: boolean;
}
