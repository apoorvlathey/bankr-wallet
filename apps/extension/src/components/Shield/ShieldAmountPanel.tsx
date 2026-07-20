import { HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import type { ShieldQuoteController } from "./hooks/useShieldQuote";
import type { ShieldReviewController } from "./hooks/useShieldReview";
import type { ShieldOperationController } from "./hooks/useShieldOperation";
import {
  ShieldDestinationCard,
  ShieldDirectionMarker,
  ShieldSourceCard,
} from "./ShieldAssetCards";
import {
  formatShieldWei,
  type ShieldSourceAccount,
} from "./model/shieldQuote";

interface ShieldAmountPanelProps {
  account: ShieldSourceAccount | null;
  quote: ShieldQuoteController;
  review: ShieldReviewController;
  operation: ShieldOperationController;
}

export default function ShieldAmountPanel({
  account,
  quote,
  review,
  operation,
}: ShieldAmountPanelProps) {
  const visibleQuote = quote.state.quote;
  const readyQuote = quote.state.status === "ready" ? quote.state.quote : null;
  const error = operation.state.status === "failed"
    ? operation.state.error
    : review.state.status === "failed"
      ? review.state.error
      : quote.state.status === "failed"
        ? quote.state.error
        : readyQuote && !readyQuote.canAfford
          ? "Not enough Sepolia ETH for this amount and network fee."
          : quote.validation.message;

  return (
    <VStack align="stretch" spacing={0}>
      <ShieldSourceCard
        label="From"
        shielded={false}
        amount={quote.amount}
        balanceWei={visibleQuote?.balanceWei ?? 0n}
        maxWei={visibleQuote?.maxShieldableWei ?? 0n}
        error={error}
        isDisabled={!account || account.type === "impersonator"}
        onAmountChange={quote.setAmount}
      />
      <ShieldDirectionMarker />
      <ShieldDestinationCard
        shielded
        amount={visibleQuote ? formatShieldWei(visibleQuote.shieldedAmountWei) : null}
        detail={visibleQuote
          ? `${formatShieldWei(visibleQuote.protocolFeeWei)} ETH protocol fee`
          : "Net of the 1% protocol fee"}
      />

      {quote.state.status === "loading" && (
        <HStack justify="center" pt={3} spacing={2} role="status">
          <Spinner size="xs" color="accent.secondary" />
          <Text fontSize="xs" color="fg.secondary">Updating quote…</Text>
        </HStack>
      )}
      {readyQuote && (
        <HStack justify="space-between" pt={3} spacing={3}>
          <Text fontSize="xs" color="fg.secondary">Privacy Pools · Sepolia</Text>
          <Text fontSize="xs" color="fg.secondary" textAlign="right">
            Network fee shown in review
          </Text>
        </HStack>
      )}
    </VStack>
  );
}
