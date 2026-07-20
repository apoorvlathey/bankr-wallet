import { Box, HStack, StackDivider, Text, VStack } from "@chakra-ui/react";
import type { GasData } from "@/chrome/txHistoryStorage";
import { formatEth, formatGwei, formatNumber } from "@/lib/gasFormatUtils";

export function GasRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack minH="40px" px={3} py={2} justify="space-between" spacing={3}>
      <Text color="fg.secondary" fontSize="xs" fontWeight="600">
        {label}
      </Text>
      <Text
        color="fg.primary"
        fontFamily="mono"
        fontSize="xs"
        fontWeight="600"
        textAlign="right"
        overflowWrap="anywhere"
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
  formatWeiUsd: (raw: string | undefined | null) => string | null;
}) {
  const showConfirmedFee = Boolean(gasData && txFee);
  const showSetParams = !showConfirmedFee && hasSetGasParams;
  if (!showConfirmedFee && !showSetParams) return null;

  const totalRaw = showConfirmedFee ? txFee : estimatedMaxCost;
  const totalLabel = totalRaw ? formatEth(totalRaw, nativeSym) : null;
  const totalUsd = formatWeiUsd(totalRaw);

  return (
    <Box borderTopWidth="1px" borderTopStyle="solid" borderTopColor="border.subtle">
      <HStack minH="44px" px={3} py={2.5} justify="space-between" spacing={3}>
        <Text color="fg.primary" fontSize="sm" fontWeight="600">
          Gas details
        </Text>
        {totalLabel && (
          <VStack spacing={0} align="flex-end">
            <Text color="fg.primary" fontFamily="mono" fontSize="xs" fontWeight="600">
              {totalLabel}
            </Text>
            {totalUsd && (
              <Text color="fg.secondary" fontSize="2xs" fontWeight="600">
                {totalUsd}
              </Text>
            )}
          </VStack>
        )}
      </HStack>

      <VStack
        spacing={0}
        align="stretch"
        bg="surface.sunken"
        divider={<StackDivider borderColor="border.subtle" />}
      >
        {showConfirmedFee && gasData ? (
          <>
            <GasRow label="Gas price" value={formatGwei(gasData.effectiveGasPrice)} />
            <GasRow
              label="Gas limit / used"
              value={`${formatNumber(gasData.gasLimit)} / ${formatNumber(gasData.gasUsed)} (${gasUsagePercent}%)`}
            />
            {isL2 && (
              <>
                <GasRow
                  label="L2 fee paid"
                  value={formatEth(
                    (
                      BigInt(gasData.gasUsed) * BigInt(gasData.effectiveGasPrice)
                    ).toString(),
                    nativeSym,
                  )}
                />
                {gasData.l1Fee && (
                  <GasRow label="L1 fee paid" value={formatEth(gasData.l1Fee, nativeSym)} />
                )}
                {gasData.l1GasPrice && (
                  <GasRow label="L1 gas price" value={formatGwei(gasData.l1GasPrice)} />
                )}
                {gasData.l1GasUsed && (
                  <GasRow label="L1 gas used" value={formatNumber(gasData.l1GasUsed)} />
                )}
              </>
            )}
          </>
        ) : (
          <>
            {setGas && (
              <GasRow label="Gas limit" value={formatNumber(BigInt(setGas).toString())} />
            )}
            {setMaxFee && <GasRow label="Max fee" value={formatGwei(setMaxFee)} />}
            {setPriority && (
              <GasRow label="Priority fee" value={formatGwei(setPriority)} />
            )}
            {setGasPrice && !setMaxFee && (
              <GasRow label="Gas price" value={formatGwei(setGasPrice)} />
            )}
          </>
        )}
      </VStack>
    </Box>
  );
}
