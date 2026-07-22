import { HStack, Text, VStack } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import type { ShieldQuoteController } from "./hooks/useShieldQuote";
import type { ShieldReviewController } from "./hooks/useShieldReview";
import type { ShieldOperationController } from "./hooks/useShieldOperation";
import {
  ShieldDestinationCard,
  ShieldDirectionMarker,
  ShieldSourceCard,
} from "./ShieldAssetCards";
import { PrivacyPoolsLogo } from "./ShieldComplianceInfoPopover";
import {
  formatShieldWei,
  SHIELD_VETTING_FEE_BPS,
  type ShieldSourceAccount,
} from "./model/shieldQuote";
import { SHIELDED_ETH_NETWORK_NAME } from "./model/shieldedAsset";

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
  const errorId = "shield-amount-error";
  const errorRef = useRef<HTMLParagraphElement>(null);
  const visibleQuote = quote.state.quote;
  const readyQuote = quote.state.status === "ready" ? quote.state.quote : null;
  const error = operation.state.status === "failed"
    ? operation.state.error
    : review.state.status === "failed"
      ? review.state.error
      : quote.state.status === "failed"
        ? quote.state.error
        : readyQuote && !readyQuote.canAfford
          ? `Not enough ${SHIELDED_ETH_NETWORK_NAME} ETH for this amount and network fee.`
          : quote.validation.message;

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  return (
    <VStack align="stretch" spacing={0}>
      <ShieldSourceCard
        label="From"
        shielded={false}
        amount={quote.amount}
        balanceWei={visibleQuote?.balanceWei ?? 0n}
        maxWei={visibleQuote?.maxShieldableWei ?? 0n}
        error={error}
        errorId={errorId}
        errorPlacement="external"
        amountWei={quote.inputAmountWei ?? 0n}
        isUsdMode={quote.isUsdMode}
        conversionLabel={quote.conversionLabel}
        onToggleAmountMode={quote.hasPrice ? quote.toggleAmountMode : undefined}
        formatAmountWei={quote.formatAmountWei}
        isDisabled={!account || account.type === "impersonator"}
        onAmountChange={quote.setAmount}
      />
      <ShieldDirectionMarker />
      <ShieldDestinationCard
        shielded
        isLoading={quote.state.status === "loading"}
        amount={visibleQuote ? formatShieldWei(visibleQuote.shieldedAmountWei) : null}
        detail={visibleQuote
          ? `${formatShieldWei(visibleQuote.protocolFeeWei)} ETH protocol fee`
          : `${Number(SHIELD_VETTING_FEE_BPS) / 100}% protocol fee`}
      />
      {visibleQuote && (
        <HStack justify="flex-end" pt={3} px={1} spacing={1.5} w="full">
          <PrivacyPoolsLogo size="18px" />
          <Text fontSize="xs" color="fg.secondary" whiteSpace="nowrap">
            Privacy Pools · {SHIELDED_ETH_NETWORK_NAME}
          </Text>
        </HStack>
      )}
      {error && (
        <Text
          ref={errorRef}
          id={errorId}
          role="alert"
          px={1}
          pt={3}
          color="status.error.fg"
          fontSize="sm"
          fontWeight="600"
        >
          {error}
        </Text>
      )}
    </VStack>
  );
}
