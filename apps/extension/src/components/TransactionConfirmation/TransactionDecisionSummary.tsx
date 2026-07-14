import { HStack, Text, VStack } from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { GasOverrides } from "@/chrome/txHandlers";
import ChainIcon from "@/components/ChainIcon";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import GasEstimateDisplay from "@/components/GasEstimateDisplay";
import type { ForceInclusionInfo, TransactionAccountType } from "./types";

interface TransactionDecisionSummaryProps {
  txRequest: PendingTxRequest;
  accountType?: TransactionAccountType;
  gasEstimateKey: number;
  forceInclusion: boolean;
  forceInclusionInfo: ForceInclusionInfo | null;
  destinationChainName: string;
  isValueMalformed: boolean;
  onGasOverrides: (overrides: GasOverrides | null) => void;
  onGasValidityChange: (valid: boolean) => void;
}

/** Keeps the signing identity and fee in view at the decision point. */
export function TransactionDecisionSummary({
  txRequest,
  accountType,
  gasEstimateKey,
  forceInclusion,
  forceInclusionInfo,
  destinationChainName,
  isValueMalformed,
  onGasOverrides,
  onGasValidityChange,
}: TransactionDecisionSummaryProps) {
  return (
    <VStack align="stretch" spacing={2}>
      <HStack minW={0} justify="space-between" spacing={3}>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
          Signing with
        </Text>
        <HStack minW={0} justify="flex-end">
          <FromAccountDisplay address={txRequest.tx.from} />
        </HStack>
      </HStack>

      {forceInclusion && forceInclusionInfo && (
        <HStack minW={0} justify="space-between" spacing={3}>
          <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
            Transacting on
          </Text>
          <HStack minW={0} justify="flex-end" spacing={1.5}>
            <ChainIcon
              chainId={txRequest.tx.chainId}
              chainName={destinationChainName}
              size="15px"
              withChip
            />
            <Text color="fg.primary" fontSize="xs" fontWeight="600" noOfLines={1}>
              {destinationChainName}
            </Text>
            <Text color="fg.muted" fontSize="2xs" fontWeight="600">
              via
            </Text>
            <ChainIcon
              chainId={forceInclusionInfo.l1ChainId}
              chainName={forceInclusionInfo.l1ChainName}
              size="15px"
              withChip
            />
            <Text color="fg.primary" fontSize="xs" fontWeight="600" noOfLines={1}>
              {forceInclusionInfo.l1ChainName}
            </Text>
          </HStack>
        </HStack>
      )}

      {!isValueMalformed && (
        <GasEstimateDisplay
          key={gasEstimateKey}
          txRequest={txRequest}
          accountType={accountType}
          onGasOverrides={onGasOverrides}
          onValidityChange={onGasValidityChange}
          forceInclusion={forceInclusion}
        />
      )}
    </VStack>
  );
}
