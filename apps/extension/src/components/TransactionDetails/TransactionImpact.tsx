import { HStack, Text, VStack } from "@chakra-ui/react";
import type {
  AssetChangeRecord,
  CompletedTransaction,
} from "@/chrome/txHistoryStorage";
import TokenLogo from "@/components/TokenLogo";
import { SHIELDED_ETH_LOGO_URL } from "@/components/Shield/model/shieldedAsset";
import { getResolvedChainById } from "@/lib/chains";
import {
  getShieldedReceiveAmountWei,
  isPrivacyShieldLifecycleState,
} from "@/lib/privacyShieldLifecycle";
import { appendTokenSymbol } from "@/lib/tokenAmountFormat";
import type { NetworksInfo } from "@/types";
import AssetChangesCard from "./AssetChangesCard";
import { formatSignedTokenAmount } from "./formatting";

type FormatUsd = (
  amountWei: string,
  decimals: number,
  chainId: number,
  addressOrNative: string | "native",
) => string | null;

function ShieldedEthReceiveRow({
  amountWei,
  chainId,
  formatUsd,
}: {
  amountWei: string;
  chainId: number;
  formatUsd: FormatUsd;
}) {
  const amount = formatSignedTokenAmount(amountWei, 18, false);
  if (!amount) return null;
  const usd = formatUsd(amountWei, 18, chainId, "native");

  return (
    <HStack justify="space-between" align="flex-start" spacing={3} minW={0} py={2}>
      <HStack spacing={2.5} minW={0} flex="1">
        <TokenLogo
          logoUrl={SHIELDED_ETH_LOGO_URL}
          symbol="Shielded ETH"
          alt="Shielded ETH"
          size="28px"
          fontSize="8px"
        />
        <Text fontSize="sm" fontWeight="700" color="fg.primary">
          Shielded ETH
        </Text>
      </HStack>
      <VStack spacing={0} align="flex-end" minW={0} maxW="58%">
        <Text
          fontSize="sm"
          fontWeight="700"
          color="chart.positive"
          fontFamily="mono"
          textAlign="right"
          overflowWrap="anywhere"
        >
          {appendTokenSymbol(amount, "ETH")}
        </Text>
        {usd && (
          <Text fontSize="2xs" color="fg.muted" fontWeight="600">
            {usd}
          </Text>
        )}
      </VStack>
    </HStack>
  );
}

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
  const shieldedReceiveAmountWei =
    tx.privacyShieldMeta &&
      isPrivacyShieldLifecycleState(tx.privacyShieldMeta.state)
      ? getShieldedReceiveAmountWei(
          tx.privacyShieldMeta.state,
          tx.privacyShieldMeta.shieldedAmountWei,
        )
      : null;

  return (
    <VStack align="stretch" spacing={3}>
      {(sourceAssetChanges || shieldedReceiveAmountWei) &&
        !(tx.bridge && tx.swapMeta) && (
        <AssetChangesCard
          record={sourceAssetChanges}
          chainId={tx.chainId}
          nativeSym={nativeSym}
          formatUsd={formatUsd}
          additionalReceive={shieldedReceiveAmountWei ? (
            <ShieldedEthReceiveRow
              amountWei={shieldedReceiveAmountWei}
              chainId={tx.chainId}
              formatUsd={formatUsd}
            />
          ) : undefined}
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
