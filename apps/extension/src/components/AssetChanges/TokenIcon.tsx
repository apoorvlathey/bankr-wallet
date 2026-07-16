import type { AssetChange } from "@/chrome/txSimulation";
import TokenLogo from "@/components/TokenLogo";

export function TokenIcon({ change }: { change: AssetChange }) {
  return (
    <TokenLogo
      logoUrl={change.logoUrl}
      symbol={change.symbol}
      alt={change.symbol}
      size="28px"
      fontSize="8px"
    />
  );
}
