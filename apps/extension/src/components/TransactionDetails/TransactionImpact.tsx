import { VStack } from "@chakra-ui/react";
import type {
  AssetChangeRecord,
  CompletedTransaction,
} from "@/chrome/txHistoryStorage";
import { getResolvedChainById } from "@/lib/chains";
import type { NetworksInfo } from "@/types";
import AssetChangesCard from "./AssetChangesCard";

type FormatUsd = (
  amountWei: string,
  decimals: number,
  chainId: number,
  addressOrNative: string | "native",
) => string | null;

export default function TransactionImpact({
  tx,
  networksInfo,
  sourceAssetChanges,
  destinationAssetChanges,
  nativeSym,
  formatUsd,
}: {
  tx: CompletedTransaction;
  networksInfo: NetworksInfo | undefined;
  sourceAssetChanges: AssetChangeRecord | undefined;
  destinationAssetChanges: AssetChangeRecord | undefined;
  nativeSym: string;
  formatUsd: FormatUsd;
}) {
  return (
    <VStack align="stretch" spacing={3}>
      {sourceAssetChanges && !(tx.bridge && tx.swapMeta) && (
        <AssetChangesCard
          record={sourceAssetChanges}
          chainId={tx.chainId}
          nativeSym={nativeSym}
          formatUsd={formatUsd}
        />
      )}
      {destinationAssetChanges && tx.bridge && !tx.swapMeta && (
        <AssetChangesCard
          record={destinationAssetChanges}
          chainId={tx.bridge.destinationChainId}
          nativeSym={
            getResolvedChainById(
              tx.bridge.destinationChainId,
              networksInfo,
            )?.nativeCurrency.symbol ?? "ETH"
          }
          label={`On ${tx.bridge.destinationChainName}`}
          formatUsd={formatUsd}
        />
      )}
    </VStack>
  );
}
