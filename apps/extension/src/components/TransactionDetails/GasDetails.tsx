import { Box, Collapse, HStack, Text, VStack } from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import type { GasData } from "@/chrome/txHistoryStorage";
import { formatEth, formatGwei, formatNumber } from "@/lib/gasFormatUtils";

function GasRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" w="full">
      <Text fontSize="xs" color="text.tertiary" fontWeight="600">
        {label}
      </Text>
      <Text
        fontSize="xs"
        fontWeight="700"
        color="text.primary"
        fontFamily="mono"
        textAlign="right"
      >
        {value}
      </Text>
    </HStack>
  );
}

export default function GasDetails({
  gasData,
  txFee,
  gasUsagePercent,
  nativeSym,
  isL2,
  setGas,
  setMaxFee,
  setPriority,
  setGasPrice,
  hasSetGasParams,
  estimatedMaxCost,
  expanded,
  onToggle,
  formatWeiUsd,
}: {
  gasData: GasData | undefined;
  txFee: string | undefined;
  gasUsagePercent: string | undefined;
  nativeSym: string;
  isL2: boolean;
  setGas: string | undefined;
  setMaxFee: string | undefined;
  setPriority: string | undefined;
  setGasPrice: string | undefined;
  hasSetGasParams: boolean;
  estimatedMaxCost: string | undefined;
  expanded: boolean;
  onToggle: () => void;
  formatWeiUsd: (raw: string | undefined | null) => string | null;
}) {
  return (
    <>
      {/* Gas — collapsible. Shows the receipt-side effective fee once
          gasData lands, and falls back to the gas params we signed
          with (gas limit, max fee, priority fee) so pending txs aren't
          blank. */}
      {(() => {
        const showConfirmedFee = !!(gasData && txFee);
        const showSetParams = !showConfirmedFee && hasSetGasParams;
        if (!showConfirmedFee && !showSetParams) return null;

        const headerLabel = showConfirmedFee ? "Transaction Fee" : "Estimated Max Fee";
        const headerCost = showConfirmedFee
          ? formatEth(txFee!, nativeSym)
          : estimatedMaxCost
            ? formatEth(estimatedMaxCost, nativeSym)
            : null;
        const headerCostUsd = formatWeiUsd(
          showConfirmedFee ? txFee : estimatedMaxCost,
        );

        return (
          <Box
            bg="surface.sunken"
            border="1px solid"
            borderColor="border.subtle"
            borderRadius="md"
          >
            <HStack
              px={3}
              py={2}
              cursor="pointer"
              onClick={() => onToggle()}
              _hover={{ bg: "bg.muted" }}
              justify="space-between"
            >
              <HStack spacing={2}>
                <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                  {headerLabel}
                </Text>
              </HStack>
              <HStack spacing={2}>
                {headerCost && (
                  <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono">
                    {headerCost}
                  </Text>
                )}
                {headerCostUsd && (
                  <Text fontSize="xs" fontWeight="600" color="text.tertiary">
                    {headerCostUsd}
                  </Text>
                )}
                {expanded
                  ? <ChevronUpIcon boxSize={4} color="text.tertiary" />
                  : <ChevronDownIcon boxSize={4} color="text.tertiary" />
                }
              </HStack>
            </HStack>

            <Collapse in={expanded} animateOpacity>
              <VStack align="stretch" spacing={1.5} px={3} pb={3} pt={1}>
                <Box h="1px" bg="border.subtle" />

                {showConfirmedFee ? (
                  <>
                    <GasRow
                      label="Gas Price"
                      value={formatGwei(gasData!.effectiveGasPrice)}
                    />

                    <GasRow
                      label="Gas Limit & Usage"
                      value={`${formatNumber(gasData!.gasLimit)} | ${formatNumber(gasData!.gasUsed)} (${gasUsagePercent}%)`}
                    />

                    {isL2 && (
                      <>
                        <Box h="1px" bg="border.subtle" mt={0.5} mb={0.5} />
                        <GasRow
                          label="L2 Fees Paid"
                          value={formatEth((BigInt(gasData!.gasUsed) * BigInt(gasData!.effectiveGasPrice)).toString(), nativeSym)}
                        />
                        {gasData!.l1Fee && (
                          <GasRow label="L1 Fees Paid" value={formatEth(gasData!.l1Fee, nativeSym)} />
                        )}
                        {gasData!.l1GasPrice && (
                          <GasRow label="L1 Gas Price" value={formatGwei(gasData!.l1GasPrice)} />
                        )}
                        {gasData!.l1GasUsed && (
                          <GasRow label="L1 Gas Used" value={formatNumber(gasData!.l1GasUsed)} />
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {setGas && (
                      <GasRow
                        label="Gas Limit"
                        value={formatNumber(BigInt(setGas).toString())}
                      />
                    )}
                    {setMaxFee && (
                      <GasRow label="Max Fee" value={formatGwei(setMaxFee)} />
                    )}
                    {setPriority && (
                      <GasRow
                        label="Max Priority Fee"
                        value={formatGwei(setPriority)}
                      />
                    )}
                    {setGasPrice && !setMaxFee && (
                      <GasRow label="Gas Price" value={formatGwei(setGasPrice)} />
                    )}
                  </>
                )}
              </VStack>
            </Collapse>
          </Box>
        );
      })()}
    </>
  );
}
