import { Button, Flex, HStack, Text, Tooltip, VStack } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { GasEstimate } from "@/chrome/gasEstimation";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import { CopyButton } from "@/components/CopyButton";
import MultiTxGasEstimateDisplay from "@/components/MultiTxGasEstimateDisplay";
import SafeImage from "@/components/SafeImage";
import { InlineDisclosure } from "@/components/ui";
import { googleFaviconUrl } from "@/constants/externalUrls";
import type { ThemeTokens } from "@/theme";
import { makeTenderlyUrl } from "./helpers";

interface EncodedBatch {
  to: string;
  data: string;
  value: string;
}

interface AdvancedDetailsProps {
  calls: PendingBatchTxRequest["params"]["calls"];
  fromAddress: string;
  chainId: number;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  decodedFunctionNames: Record<number, string>;
  isNonAtomic: boolean;
  isLocalSigningAccount: boolean;
  isAtomic7702: boolean;
  outerEncodedBatch: EncodedBatch;
  eip7702Delegate?: `0x${string}`;
  forceInclusion: boolean;
  showAddToBatch: boolean;
  addToBatchDisabledReason: string | null;
  isAddingToBatch: boolean;
  batchedCount: number;
  borders: ThemeTokens["borders"];
  onGasEstimates: (estimates: GasEstimate[]) => void;
  onGasValidityChange: (valid: boolean) => void;
  onNativePriceUsd: (price: number | null) => void;
  onAnyFailedChange: (failed: boolean) => void;
  onAddToBatch: () => void;
}

export function AdvancedDetails({
  calls,
  fromAddress,
  chainId,
  accountType,
  decodedFunctionNames,
  isNonAtomic,
  isLocalSigningAccount,
  isAtomic7702,
  outerEncodedBatch,
  eip7702Delegate,
  forceInclusion,
  showAddToBatch,
  addToBatchDisabledReason,
  isAddingToBatch,
  batchedCount,
  borders,
  onGasEstimates,
  onGasValidityChange,
  onNativePriceUsd,
  onAnyFailedChange,
  onAddToBatch,
}: AdvancedDetailsProps) {
  const tenderlyUrl = makeTenderlyUrl(fromAddress, chainId, outerEncodedBatch);

  return (
    <InlineDisclosure
      label="Advanced details"
      description="Network fees, encoded calldata, simulation tools, and batching options."
    >
      <VStack spacing={3} align="stretch" pt={3}>
        <MultiTxGasEstimateDisplay
          transactions={calls.map((call, index) => ({
            tx: {
              from: fromAddress,
              to: call.to || "0x0000000000000000000000000000000000000000",
              data: call.data || "0x",
              value: call.value || "0x0",
              chainId,
            },
            label: decodedFunctionNames[index] || `Call ${index + 1}`,
          }))}
          accountType={accountType || "bankr"}
          isNonAtomic={isNonAtomic}
          onGasEstimates={isLocalSigningAccount ? onGasEstimates : undefined}
          onValidityChange={onGasValidityChange}
          onNativePriceUsd={onNativePriceUsd}
          onAnyFailedChange={onAnyFailedChange}
          forceInclusion={forceInclusion}
          batchedTx={isNonAtomic ? undefined : {
            tx: {
              from: fromAddress,
              to: outerEncodedBatch.to,
              data: outerEncodedBatch.data,
              value: outerEncodedBatch.value,
              chainId,
            },
            label: `Batch Transaction (${calls.length} calls)`,
          }}
          eip7702Delegate={eip7702Delegate}
        />

        <VStack spacing={2} align="stretch">
          {isAtomic7702 && outerEncodedBatch.data && outerEncodedBatch.data !== "0x" && (
            <CalldataDigestDisplay calldata={outerEncodedBatch.data} />
          )}

          {(!isNonAtomic || showAddToBatch) && (
            <HStack spacing={1.5} w="full" align="stretch">
              {!isNonAtomic && (
                <HStack
                  spacing={2}
                  flex={1}
                  minW={0}
                  border={borders.thin}
                  borderColor="border.default"
                  borderRadius="md"
                  px={3}
                  py={1.5}
                  justify="center"
                  _hover={{ bg: "bg.muted" }}
                  transition="background 0.15s"
                >
                  <CopyButton value={tenderlyUrl} />
                  <HStack
                    spacing={2}
                    cursor="pointer"
                    onClick={() => chrome.tabs.create({ url: tenderlyUrl })}
                  >
                    <SafeImage src={googleFaviconUrl("tenderly.co")} boxSize="14px" />
                    <Text
                      fontWeight="700"
                      fontSize="xs"
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      Simulate on Tenderly
                    </Text>
                    <ExternalLinkIcon boxSize={3} />
                  </HStack>
                </HStack>
              )}
              {showAddToBatch && (
                <Tooltip
                  label={addToBatchDisabledReason ?? ""}
                  isDisabled={!addToBatchDisabledReason}
                  hasArrow
                  fontSize="xs"
                >
                  <Flex alignSelf="stretch" flexShrink={0}>
                    <Button
                      variant="outline"
                      onClick={onAddToBatch}
                      isDisabled={!!addToBatchDisabledReason || isAddingToBatch}
                      isLoading={isAddingToBatch}
                      aria-label="Add to batch"
                      fontWeight="600"
                      textTransform="none"
                      letterSpacing="normal"
                      fontSize="xs"
                      px={2.5}
                      h="full"
                      minH={8}
                    >
                      {batchedCount > 0 ? `+ Batch (${batchedCount})` : "+ Batch"}
                    </Button>
                  </Flex>
                </Tooltip>
              )}
            </HStack>
          )}
        </VStack>
      </VStack>
    </InlineDisclosure>
  );
}
