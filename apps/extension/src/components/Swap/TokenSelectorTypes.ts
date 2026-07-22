import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { TokenListEntry } from "@/chrome/swapApi";
import type { NetworkSelectorOption } from "@/components/shared/NetworkSelector";

export interface TokenSelectorProps {
  holdings: PortfolioToken[];
  tokenList: TokenListEntry[];
  selectedToken: PortfolioToken | null;
  onSelect: (token: PortfolioToken) => void;
  excludeAddress?: string;
  chainId: number;
  onCustomAddress?: (address: string) => void;
  onSelectCustomToken?: (token: PortfolioToken) => void;
  resolvedCustomToken?: PortfolioToken | null;
  customTokenLoading?: boolean;
  customTokenError?: string | null;
  chainName?: string;
  triggerContentAlign?: "left" | "right";
  dropdownAlign?: "left" | "right";
  isLoadingHoldings?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  networkOptions?: readonly NetworkSelectorOption[];
  onSelectChain?: (chainId: number) => void;
}
