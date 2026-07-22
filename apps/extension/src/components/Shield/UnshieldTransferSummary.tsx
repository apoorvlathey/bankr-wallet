import { ArrowDownIcon } from "@chakra-ui/icons";
import { Box, HStack, Image, Text, VStack } from "@chakra-ui/react";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { truncateAddress } from "@/lib/addressUtils";
import type { UnshieldOperation } from "./model/unshield";
import {
  SHIELDED_ETH_EXPLORER_URL,
  SHIELDED_ETH_LOGO_URL,
} from "./model/shieldedAsset";
import { formatShieldUsdValue, formatShieldWei } from "./model/shieldQuote";

const ETH_LOGO_URL = "/chainIcons/ethereum.svg";

function TransferAmount({
  amountWei,
  nativePriceUsd,
  sign,
  tone,
}: {
  amountWei: bigint;
  nativePriceUsd: number | null;
  sign: "+" | "−";
  tone: "chart.positive" | "chart.negative";
}) {
  const valueUsd = formatShieldUsdValue(amountWei, nativePriceUsd);

  return (
    <VStack align="start" spacing={0.5} minW={0}>
      <Text
        color={tone}
        fontFamily="mono"
        fontSize="xl"
        fontWeight="700"
        lineHeight="shorter"
        overflowWrap="anywhere"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {sign}{formatShieldWei(amountWei)} ETH
      </Text>
      {valueUsd ? (
        <Text
          color="fg.secondary"
          fontFamily="mono"
          fontSize="xs"
          fontWeight="600"
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          {valueUsd}
        </Text>
      ) : null}
    </VStack>
  );
}

/** The primary receipt story: private ETH leaves the pool and reaches one address. */
export default function UnshieldTransferSummary({
  operation,
  nativePriceUsd,
}: {
  operation: UnshieldOperation;
  nativePriceUsd: number | null;
}) {
  const recipientLabel = truncateAddress(operation.recipient);

  return (
    <Box
      as="section"
      aria-label={`Unshielded ETH transfer to ${operation.recipient}`}
      bg="surface.raised"
      borderWidth="1px"
      borderStyle="solid"
      borderColor="border.default"
      borderRadius="lg"
      px={4}
      py={4}
    >
      <HStack justify="space-between" align="flex-start" spacing={4}>
        <VStack align="start" spacing={1} minW={0}>
          <Text color="fg.secondary" fontSize="xs" fontWeight="600">
            From private balance
          </Text>
          <TransferAmount
            amountWei={operation.amountWei}
            nativePriceUsd={nativePriceUsd}
            sign="−"
            tone="chart.negative"
          />
        </VStack>
        <Image
          src={SHIELDED_ETH_LOGO_URL}
          alt="Shielded ETH"
          boxSize="42px"
          flexShrink={0}
        />
      </HStack>

      <HStack my={3} ml={1} spacing={2} color="fg.muted">
        <ArrowDownIcon boxSize="14px" aria-hidden />
        <Text fontSize="2xs" fontWeight="600">
          Unshield
        </Text>
      </HStack>

      <HStack justify="space-between" align="flex-start" spacing={4}>
        <VStack align="start" spacing={1} minW={0}>
          <Text color="fg.secondary" fontSize="xs" fontWeight="600">
            Receiver gets
          </Text>
          <TransferAmount
            amountWei={operation.netRecipientAmountWei}
            nativePriceUsd={nativePriceUsd}
            sign="+"
            tone="chart.positive"
          />
        </VStack>
        <Image
          src={ETH_LOGO_URL}
          alt="ETH"
          boxSize="42px"
          flexShrink={0}
        />
      </HStack>

      <HStack
        mt={4}
        pt={3}
        justify="space-between"
        align="center"
        spacing={3}
        borderTopWidth="1px"
        borderTopStyle="solid"
        borderTopColor="border.subtle"
      >
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          To address
        </Text>
        <LabeledAddressPopover
          address={operation.recipient}
          contextLabel="unshield recipient"
          explorer={SHIELDED_ETH_EXPLORER_URL}
          label={recipientLabel}
          maxW="180px"
        />
      </HStack>
    </Box>
  );
}
