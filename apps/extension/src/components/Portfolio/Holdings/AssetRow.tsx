import type { AssetDisplayRow, AssetRowPresentationProps } from "./types";
import { AggregatedAssetRow } from "./AggregatedAssetRow";
import { TokenRow } from "./TokenRow";

interface AssetRowProps extends AssetRowPresentationProps {
  row: AssetDisplayRow;
}

export function AssetRow({ row, ...presentation }: AssetRowProps) {
  if (row.kind === "aggregate") {
    return (
      <AggregatedAssetRow
        symbol={row.symbol}
        tokens={row.tokens}
        {...presentation}
      />
    );
  }

  return <TokenRow token={row.token} {...presentation} />;
}
