import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { Account } from "@/chrome/types";

export type TransferAccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "ledger"
  | "impersonator"
  | "safe";

export interface TokenTransferProps {
  token?: PortfolioToken | null;
  fromAddress: string;
  chainId: number;
  accountType: TransferAccountType;
  accounts?: Account[];
  selectableChainIds?: ReadonlySet<number>;
  onBack: () => void;
  onTransferInitiated: (sponsored?: boolean) => void;
}

export interface SponsoredTransferFailure {
  message: string;
  outcomeUncertain: boolean;
}
