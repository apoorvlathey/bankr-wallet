import {
  Box,
  Button,
  Divider,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";

import type { ShieldQuoteController } from "./hooks/useShieldQuote";
import type { ShieldReviewController } from "./hooks/useShieldReview";
import type { ShieldOperationController } from "./hooks/useShieldOperation";
import {
  compactShieldSource,
  formatShieldWei,
  SHIELD_MINIMUM_WEI,
  type ShieldSourceAccount,
} from "./model/shieldQuote";

interface ShieldAmountPanelProps {
  account: ShieldSourceAccount | null;
  quote: ShieldQuoteController;
  review: ShieldReviewController;
  operation: ShieldOperationController;
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" spacing={3}>
      <Text color="fg.secondary" fontSize="xs">
        {label}
      </Text>
      <Text fontFamily="mono" fontSize="xs" fontWeight="700">
        {value}
      </Text>
    </HStack>
  );
}

export default function ShieldAmountPanel({
  account,
  quote,
  review,
  operation,
}: ShieldAmountPanelProps) {
  const readyQuote = quote.state.status === "ready" ? quote.state.quote : null;
  const amountError = quote.validation.message;
  const quoteError = quote.state.status === "failed" ? quote.state.error : null;
  const insufficient = readyQuote ? !readyQuote.canAfford : false;
  const canUseMaximum = Boolean(
    readyQuote && readyQuote.maxShieldableWei >= SHIELD_MINIMUM_WEI,
  );

  return (
    <Box
      as="section"
      aria-labelledby="shield-amount-heading"
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      px={4}
      py={4}
    >
      <HStack justify="space-between" align="baseline" mb={3} spacing={3}>
        <Text id="shield-amount-heading" fontSize="sm" fontWeight="700">
          Shield ETH
        </Text>
        {account ? (
          <Text color="fg.secondary" fontSize="xs" noOfLines={1}>
            From {compactShieldSource(account)}
          </Text>
        ) : null}
      </HStack>

      <InputGroup>
        <Input
          id="shield-amount"
          aria-label="ETH amount to Shield"
          aria-invalid={Boolean(amountError || insufficient || quoteError)}
          value={quote.amount}
          onChange={(event) => quote.setAmount(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          maxLength={80}
          placeholder="0.001"
          fontFamily="mono"
          fontSize="lg"
          fontWeight="600"
          minH="52px"
          pr="92px"
        />
        <InputRightElement h="full" w="88px" pr={2}>
          <HStack spacing={1}>
            <Text color="fg.secondary" fontSize="xs" fontWeight="700">
              ETH
            </Text>
            <Button
              size="xs"
              variant="ghost"
              color="accent.secondary"
              fontWeight="800"
              minW="auto"
              px={1}
              isDisabled={!canUseMaximum}
              onClick={quote.useMaximum}
            >
              MAX
            </Button>
          </HStack>
        </InputRightElement>
      </InputGroup>

      <HStack justify="space-between" mt={1.5} minH="18px" spacing={3}>
        <Text
          role={amountError || insufficient || quoteError ? "alert" : undefined}
          color={amountError || insufficient || quoteError ? "chart.negative" : "fg.muted"}
          fontSize="xs"
        >
          {amountError ??
            quoteError ??
            (insufficient
              ? "Not enough Sepolia ETH for this amount and fee."
              : "Minimum 0.001 ETH")}
        </Text>
        <Text color="fg.secondary" fontSize="xs" whiteSpace="nowrap">
          {readyQuote
            ? `Available ${formatShieldWei(readyQuote.balanceWei)} ETH`
            : quote.state.status === "loading"
              ? "Checking…"
              : null}
        </Text>
      </HStack>

      {quote.state.status === "loading" ? (
        <HStack justify="center" py={5} spacing={2} role="status">
          <Spinner size="sm" color="accent.secondary" />
          <Text color="fg.secondary" fontSize="xs">
            Updating quote…
          </Text>
        </HStack>
      ) : readyQuote ? (
        <VStack align="stretch" spacing={2.5} mt={4}>
          <Divider borderColor="border.default" />
          <QuoteRow
            label="Shield fee (1%)"
            value={`${formatShieldWei(readyQuote.protocolFeeWei)} ETH`}
          />
          <QuoteRow
            label="Shield balance gets"
            value={`${formatShieldWei(readyQuote.shieldedAmountWei)} ETH`}
          />
          <QuoteRow
            label="Network fee reserve"
            value={`${formatShieldWei(readyQuote.gasReserveWei)} ETH`}
          />
          <QuoteRow
            label="Total needed"
            value={`${formatShieldWei(readyQuote.totalRequiredWei)} ETH`}
          />
          <Button
            variant="brand"
            minH="44px"
            mt={1}
            isLoading={review.state.status === "preparing"}
            loadingText="Preparing"
            isDisabled={insufficient || review.state.status === "ready"}
            onClick={review.prepare}
          >
            {review.state.status === "ready" ? "Ready for review" : "Continue"}
          </Button>

          {review.state.status === "ready" ? (
            <VStack align="stretch" spacing={2.5} pt={2}>
              <Divider borderColor="border.default" />
              <QuoteRow label="Network" value="Sepolia" />
              <QuoteRow label="Route" value="Privacy Pools" />
              <Text color="fg.secondary" fontSize="xs">
                Your deposit account, amount, and timing will be public.
              </Text>
              <Button
                variant="brand"
                minH="44px"
                isLoading={operation.state.status === "saving"}
                loadingText="Opening"
                isDisabled={operation.state.status === "saved"}
                onClick={operation.save}
              >
                {operation.state.status === "saved"
                  ? "Ready to confirm"
                  : "Review transaction"}
              </Button>
            </VStack>
          ) : null}
        </VStack>
      ) : null}

      <Text
        mt={3}
        role={
          review.state.status === "failed" || operation.state.status === "failed"
            ? "alert"
            : "status"
        }
        color={
          review.state.status === "failed" || operation.state.status === "failed"
            ? "chart.negative"
            : "fg.muted"
        }
        fontSize="xs"
        textAlign="center"
      >
        {operation.state.status === "failed"
          ? operation.state.error
          : operation.state.status === "saved"
            ? "Review the wallet confirmation to continue."
            : review.state.status === "failed"
          ? review.state.error
          : review.state.status === "ready"
            ? "Ready for review — nothing sent yet."
            : "Nothing is sent until you confirm the transaction."}
      </Text>
    </Box>
  );
}
