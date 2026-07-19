import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Box,
  HStack,
  IconButton,
  StackDivider,
  Text,
  VStack,
} from "@chakra-ui/react";

import { ENTRY_POINT_V07, WALLETCHAN_OFFICIAL_DELEGATE } from "@/chrome/feePayment/constants";
import type { FeePaymentQuoteSummary } from "@/components/FeePaymentSelector";
import { formatTokenAmount } from "@/components/feePaymentUi";
import { CopyButton } from "@/components/CopyButton";
import { getChainConfig } from "@/constants/chainConfig";

function AddressRow({
  label,
  address,
  chainId,
}: {
  label: string;
  address: `0x${string}`;
  chainId: number;
}) {
  const explorer = getChainConfig(chainId).explorer;
  return (
    <HStack px={3} py={2.5} justify="space-between" spacing={2} minW={0}>
      <Text color="fg.secondary" fontSize="2xs" flexShrink={0}>
        {label}
      </Text>
      <HStack spacing={0.5} minW={0}>
        <Text
          color="fg.primary"
          fontFamily="mono"
          fontSize="2xs"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          title={address}
        >
          {address}
        </Text>
        <CopyButton value={address} label={`Copy ${label}`} />
        {explorer && (
          <IconButton
            as="a"
            href={`${explorer}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${label} on explorer`}
            icon={<ExternalLinkIcon boxSize="11px" />}
            size="xs"
            minW="24px"
            w="24px"
            h="24px"
            variant="ghost"
          />
        )}
      </HStack>
    </HStack>
  );
}

function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack px={3} py={2.5} justify="space-between" spacing={3}>
      <Text color="fg.secondary" fontSize="2xs">
        {label}
      </Text>
      <Text color="fg.primary" fontSize="2xs" textAlign="right">
        {value}
      </Text>
    </HStack>
  );
}

export function FeePaymentAdvancedDetails({
  chainId,
  token,
  quote,
}: {
  chainId: number;
  token: "native" | `0x${string}`;
  quote: FeePaymentQuoteSummary | null;
}) {
  if (token === "native") return null;
  return (
    <Box
      bg="surface.raised"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
    >
      <Box px={3} py={2.5} bg="surface.sunken">
        <Text color="fg.primary" fontSize="xs" fontWeight="700">
          ERC-4337 fee payment
        </Text>
        <Text color="fg.muted" fontSize="2xs" mt={0.5}>
          Signed only after you confirm. Broadcast by Pimlico through EntryPoint v0.7.
        </Text>
      </Box>
      <VStack
        align="stretch"
        spacing={0}
        divider={<StackDivider borderColor="border.subtle" />}
      >
        <TextRow label="Bundler" value="Pimlico" />
        <AddressRow label="EntryPoint" address={ENTRY_POINT_V07} chainId={chainId} />
        {quote && (
          <>
            <AddressRow label="Paymaster" address={quote.paymaster} chainId={chainId} />
            <TextRow label="UserOperation nonce" value={quote.userOperationNonce} />
            <TextRow
              label={`${quote.tokenSymbol} allowance`}
              value={quote.approvalAdded && quote.approvalAmount
                ? `Exact ${formatTokenAmount(quote.approvalAmount, quote.tokenDecimals)} ${quote.tokenSymbol} approval included`
                : "Existing allowance covers the maximum"}
            />
            <TextRow
              label="Maximum charge"
              value={`${formatTokenAmount(quote.maximumTokenCost, quote.tokenDecimals)} ${quote.tokenSymbol}${quote.tokenStablecoin ? ` (≈ $${formatTokenAmount(quote.maximumTokenCost, quote.tokenDecimals)})` : ""}`}
            />
            {quote.needsAuthorization && (
              <AddressRow
                label="One-time delegate"
                address={WALLETCHAN_OFFICIAL_DELEGATE}
                chainId={chainId}
              />
            )}
          </>
        )}
      </VStack>
    </Box>
  );
}
