import { Box, HStack, Icon, Text, Tooltip, VStack } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import TokenLogo from "@/components/TokenLogo";
import { formatEthExact, formatEthFee } from "@/lib/gasFormatUtils";
import { formatLocalTimestamp } from "./formatting";
import {
  formatErc20FeeDisplayAmount,
  getErc20FeeStatusLabel,
  type Erc20FeeDisplay,
} from "./feeDisplay";

function GasPumpIcon() {
  return (
    <Icon viewBox="0 0 24 24" boxSize="16px" fill="none" aria-hidden>
      <path
        d="M5.5 20V6.5A2.5 2.5 0 0 1 8 4h5a2.5 2.5 0 0 1 2.5 2.5V20M4 20h13M8 8h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m15.5 8.25 2.25 2.25v5.75a1.75 1.75 0 1 0 3.5 0V11.5l-1.5-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export default function TransactionMeta({
  tx,
  nativeSym,
  txFee,
  estimatedMaxCost,
  erc20Fee,
  displayTimestamp,
  formatWeiUsd,
}: {
  tx: CompletedTransaction;
  nativeSym: string;
  txFee: string | undefined;
  estimatedMaxCost: string | undefined;
  erc20Fee?: Erc20FeeDisplay;
  displayTimestamp: number;
  formatWeiUsd: (raw: string | undefined | null) => string | null;
}) {
  const feeRaw = erc20Fee ? undefined : txFee ?? estimatedMaxCost;
  const feeLabel = feeRaw ? formatEthFee(feeRaw, nativeSym) : null;
  const fullFeeLabel = feeRaw ? formatEthExact(feeRaw, nativeSym) : null;
  const feeUsd =
    feeRaw && BigInt(feeRaw) === 0n ? "$0.00" : formatWeiUsd(feeRaw);
  const isEstimatedFee = !txFee && Boolean(estimatedMaxCost);
  const erc20AmountLabel = erc20Fee
    ? formatErc20FeeDisplayAmount(erc20Fee)
    : null;
  const erc20Primary = erc20Fee
    ? erc20Fee.usd ?? erc20AmountLabel ?? getErc20FeeStatusLabel(erc20Fee)
    : null;
  const erc20Secondary = erc20Fee
    ? erc20Fee.usd && erc20AmountLabel
      ? erc20AmountLabel
      : erc20Fee.symbol ?? `${erc20Fee.token.slice(0, 6)}…${erc20Fee.token.slice(-4)}`
    : null;

  return (
    <VStack spacing={3} align="stretch">
      <HStack spacing={2} justify="space-between" align="center" flexWrap="wrap">
        {erc20Fee && erc20Primary && erc20Secondary && (
          <Tooltip
            label={erc20AmountLabel ?? getErc20FeeStatusLabel(erc20Fee)}
            placement="top"
            openDelay={250}
            hasArrow
          >
            <HStack
              spacing={2}
              minH="40px"
              px={3.5}
              py={2}
              bg="surface.raised"
              borderRadius="full"
              color="fg.secondary"
              role="group"
              cursor="help"
              aria-label={`Gas fee ${erc20Primary}, ${erc20Secondary}`}
            >
              <TokenLogo
                symbol={erc20Fee.symbol}
                logoUrl={erc20Fee.logoUrl}
                alt={erc20Fee.symbol || "Fee token"}
                size="18px"
                fontSize="7px"
              />
              <VStack spacing={0} align="flex-start">
                <Text
                  color="fg.primary"
                  fontSize="xs"
                  fontWeight="700"
                  lineHeight="short"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {erc20Primary}
                </Text>
                <Text
                  color="fg.secondary"
                  fontSize="2xs"
                  fontWeight="600"
                  lineHeight="short"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {erc20Secondary}
                </Text>
              </VStack>
            </HStack>
          </Tooltip>
        )}
        {feeLabel && fullFeeLabel && (
          <Tooltip
            label={fullFeeLabel}
            placement="top"
            openDelay={250}
            hasArrow
          >
            <HStack
              spacing={2}
              minH="40px"
              px={3.5}
              py={2}
              bg="surface.raised"
              borderRadius="full"
              color="fg.secondary"
              role="group"
              cursor="help"
              aria-label={`${isEstimatedFee ? "Maximum gas fee" : "Gas fee"} ${
                feeUsd ?? feeLabel
              }, ${fullFeeLabel}`}
            >
              <GasPumpIcon />
              <VStack spacing={0} align="flex-start">
                <Text
                  color="fg.primary"
                  fontSize="xs"
                  fontWeight="700"
                  lineHeight="short"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {feeUsd ?? feeLabel}
                </Text>
                {feeUsd && (
                  <Text
                    color="fg.secondary"
                    fontSize="2xs"
                    fontWeight="600"
                    lineHeight="short"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {feeLabel}
                  </Text>
                )}
              </VStack>
            </HStack>
          </Tooltip>
        )}

        <Box
          minW={0}
          maxW="100%"
          ml="auto"
          px={3.5}
          py={2}
          bg="surface.raised"
          borderRadius="full"
          role="group"
          aria-label={`Signing account ${tx.tx.from}`}
        >
          <FromAccountDisplay address={tx.tx.from} />
        </Box>
      </HStack>

      {tx.parentBundleId && tx.bundleIndex !== undefined && (
        <Text color="fg.secondary" fontSize="2xs" fontWeight="600">
          Sequential batch · call {tx.bundleIndex + 1}
        </Text>
      )}

      <Text
        color="fg.muted"
        fontSize="xs"
        fontWeight="500"
        textAlign="center"
        opacity={0.7}
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatLocalTimestamp(displayTimestamp)}
      </Text>
    </VStack>
  );
}
