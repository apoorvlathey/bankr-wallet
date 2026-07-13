import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import type {
  AssetChangeRecord,
  CompletedTransaction,
} from "@/chrome/txHistoryStorage";
import type { NetworksInfo } from "@/types";
import { getChainConfig } from "@/constants/chainConfig";
import { getResolvedChainById } from "@/lib/chains";
import AssetChangesCard from "./AssetChangesCard";
import { formatLocalTimestamp } from "./formatting";

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
  explorerBase,
  displayTimestamp,
  formatUsd,
  onViewExplorer,
}: {
  tx: CompletedTransaction;
  networksInfo: NetworksInfo | undefined;
  sourceAssetChanges: AssetChangeRecord | undefined;
  destinationAssetChanges: AssetChangeRecord | undefined;
  nativeSym: string;
  explorerBase: string;
  displayTimestamp: number;
  formatUsd: FormatUsd;
  onViewExplorer: () => void;
}) {
  return (
    <>
      {/* Post-confirm asset changes — what *actually* flowed in/out of
          the user's wallet on chain (decoded from the receipt's
          Transfer logs + native balance diff). For wallet-initiated
          bridges (`swapMeta + bridge`) the sell/buy rows are already
          shown inline in the Source / Destination blocks above, so we
          suppress these cards to avoid duplication. */}
      {sourceAssetChanges && !(tx.bridge && tx.swapMeta) && (
        <AssetChangesCard
          record={sourceAssetChanges}
          chainId={tx.chainId}
          nativeSym={nativeSym}
          label="Token changes"
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

      <HStack justify="space-between" align="center" spacing={3}>
        {tx.forceInclusionMeta ? (
          <HStack spacing={2}>
            {/* L1 explorer link */}
            {tx.forceInclusionMeta.l1TxHash && (
              <Button
                size="xs"
                variant="ghost"
                fontWeight="700"
                fontSize="2xs"
                textTransform="uppercase"
                letterSpacing="wide"
                border="2px solid"
                borderColor="border.default"
                px={2}
                h="22px"
                onClick={() => {
                  const l1Explorer = getChainConfig(tx.forceInclusionMeta!.l1ChainId).explorer;
                  if (l1Explorer) chrome.tabs.create({ url: `${l1Explorer}/tx/${tx.forceInclusionMeta!.l1TxHash}` });
                }}
                rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                _hover={{ bg: "bg.muted" }}
              >
                L1 Tx
              </Button>
            )}
            {/* L2 explorer link — show whenever we have a distinct L2 hash
                 AND the L2 tx has resolved (success or failed/reverted).
                 During the L1-Confirmed/L2-Pending window (status === "pending")
                 the L2 explorer doesn't have the tx yet, so we still hide it.
                 Also hidden when txHash falls back to the L1 hash
                 (extractL2Hash failed — no real L2 hash to link). */}
            {(tx.status === "success" || tx.status === "failed") && tx.txHash && tx.txHash !== tx.forceInclusionMeta.l1TxHash && explorerBase && (
              <Button
                size="xs"
                variant="ghost"
                fontWeight="700"
                fontSize="2xs"
                textTransform="uppercase"
                letterSpacing="wide"
                border="2px solid"
                borderColor="border.default"
                px={2}
                h="22px"
                onClick={onViewExplorer}
                rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                _hover={{ bg: "bg.muted" }}
              >
                L2 Tx
              </Button>
            )}
          </HStack>
        ) : tx.txHash && explorerBase ? (
          <Button
            size="xs"
            variant="ghost"
            fontWeight="700"
            fontSize="2xs"
            textTransform="uppercase"
            letterSpacing="wide"
            border="2px solid"
            borderColor="border.default"
            px={2}
            h="22px"
            onClick={onViewExplorer}
            rightIcon={<ExternalLinkIcon boxSize={2.5} />}
            _hover={{ bg: "bg.muted" }}
          >
            View on Explorer
          </Button>
        ) : (
          <Box />
        )}
        <Text fontSize="2xs" fontWeight="600" color="text.tertiary" textAlign="right">
          {formatLocalTimestamp(displayTimestamp)}
        </Text>
      </HStack>
    </>
  );
}
