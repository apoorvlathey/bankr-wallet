import type { PortfolioToken } from "@/chrome/portfolio/api";
import { getPortfolioTokenKey } from "@/chrome/portfolio/hiddenTokens";
import { PortfolioTokenRow } from "@/components/PortfolioHoldingRows";
import type { AssetRowPresentationProps } from "./types";

interface TokenRowProps extends AssetRowPresentationProps {
  token: PortfolioToken;
  displayMode?: "token" | "chainBreakdown";
}

export function TokenRow({
  token,
  customTokenKeys,
  networksInfo,
  onTokenClick,
  onSwapClick,
  onEditToken,
  onHideToken,
  resolveLogo,
  hideValue,
  formatUsd,
  displayMode,
}: TokenRowProps) {
  return (
    <PortfolioTokenRow
      token={token}
      tokenKey={getPortfolioTokenKey(token.chainId, token.contractAddress)}
      customTokenKeys={customTokenKeys}
      networksInfo={networksInfo}
      onTokenClick={onTokenClick}
      onSwapClick={onSwapClick}
      onEditToken={onEditToken}
      onHideToken={onHideToken}
      resolveLogo={resolveLogo}
      hideValue={hideValue}
      formatUsd={formatUsd}
      displayMode={displayMode}
    />
  );
}
