import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  HStack,
  Image,
  Text,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { ConfirmationScreen, ListSurface } from "@/components/ui";
import type { PrivacyPoolsMutationAccount } from "@/chrome/privacy/deployment/accountPolicy";
import LoadingDots from "@/components/LoadingDots";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import type { ReturnTypeUseUnshield } from "./hooks/useUnshield.types";
import type { ReturnTypeUseDirectUnshield } from "./hooks/useDirectUnshield.types";
import { useAutoRefreshUnshieldQuote } from "./hooks/useAutoRefreshUnshieldQuote";
import {
  SHIELDED_ETH_LOGO_URL,
  SHIELDED_ETH_NETWORK_NAME,
} from "./model/shieldedAsset";
import { formatShieldUsdValue, formatShieldWei } from "./model/shieldQuote";
import {
  formatRelayFeePercentage,
  getUnshieldCopy,
} from "./model/unshield";
import UnshieldDetailRow from "./UnshieldDetailRow";
import WithdrawalMethodSheet from "./WithdrawalMethodSheet";
import AnimatedQuoteExpiry from "./AnimatedQuoteExpiry";

const ETH_LOGO_URL = "/chainIcons/ethereum.svg";

interface UnshieldReviewProps {
  controller: ReturnTypeUseUnshield;
  recipientLabel?: string | null;
  explorerUrl: string;
  nativePriceUsd: number | null;
  recoveryPanel?: ReactNode;
  publicWithdrawAvailable?: boolean;
  onPublicWithdraw?: () => void;
  directAccount?: PrivacyPoolsMutationAccount | null;
  directController: ReturnTypeUseDirectUnshield;
  onBack: () => void;
}

export default function UnshieldReview({
  controller,
  recipientLabel,
  explorerUrl,
  nativePriceUsd,
  recoveryPanel,
  publicWithdrawAvailable = false,
  onPublicWithdraw,
  directAccount = null,
  directController,
  onBack,
}: UnshieldReviewProps) {
  const operation = controller.state.operation;
  const warning = controller.state.status === "fee-warning"
    ? controller.state.warning
    : null;
  const [now, setNow] = useState(Date.now());
  const [method, setMethod] = useState<"relay" | "direct">("relay");
  const methodSheet = useDisclosure();
  const methodButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!operation) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [operation]);

  useAutoRefreshUnshieldQuote({
    enabled: method === "relay" && controller.state.status === "quoted",
    operation,
    refreshQuote: controller.quote,
  });

  const inputAmountWei = operation?.amountWei ?? (
    controller.amountValidation.valid ? controller.amountValidation.amountWei : 0n
  );
  const quotedFeeBPS = operation?.feeBPS ?? warning?.quotedFeeBPS ?? null;
  const relayFeeWei = operation?.relayFeeWei ?? (
    warning ? inputAmountWei * warning.quotedFeeBPS / 10_000n : null
  );
  const relayRecipientAmountWei = operation?.netRecipientAmountWei ?? (
    relayFeeWei !== null
      ? relayFeeWei < inputAmountWei ? inputAmountWei - relayFeeWei : 0n
      : null
  );
  const recipientAmountWei = method === "direct" ? inputAmountWei : relayRecipientAmountWei;
  const recipient = operation?.recipient || controller.recipient;
  const relayerName = operation?.relayerName ?? warning?.relayerName ?? null;
  const isQuoting = controller.state.status === "quoting" || controller.state.status === "idle";
  const isSubmitting = controller.state.status === "proving";
  const isDirectPreparing = directController.state.status === "preparing";
  const submitted = controller.state.status === "submitted";
  const error = controller.state.status === "error" ? controller.state.error : null;
  const expired = Boolean(operation && operation.expiresAt <= now);
  const copy = getUnshieldCopy();
  const hasQuoteValues = method === "direct" ||
    (recipientAmountWei !== null && relayFeeWei !== null && quotedFeeBPS !== null);
  const relayFeeUsd = relayFeeWei !== null
    ? formatShieldUsdValue(relayFeeWei, nativePriceUsd)
    : null;
  const sourceAmountUsd = formatShieldUsdValue(inputAmountWei, nativePriceUsd);
  const recipientAmountUsd = recipientAmountWei !== null
    ? formatShieldUsdValue(recipientAmountWei, nativePriceUsd)
    : null;
  const addressLabel = recipientLabel || (
    recipient ? `${recipient.slice(0, 6)}…${recipient.slice(-4)}` : "Address"
  );

  const directError = directController.state.status === "error"
    ? directController.state.error
    : null;
  const actionNotice = method === "direct" ? (
    <VStack align="stretch" spacing={2}>
      <Box
        bg="status.warning.tint"
        borderWidth="1px"
        borderColor="status.warning.border"
        borderRadius="md"
        px={3}
        py={2.5}
      >
        <Text fontSize="xs" fontWeight="600" color="status.warning.emphasis">
          This receiving account will publicly submit and receive the withdrawal.
          The original deposit stays hidden among approved deposits, but timing,
          amounts, and existing account activity can weaken privacy.
        </Text>
      </Box>
      {directError ? (
        <Text role="alert" fontSize="xs" color="status.error.emphasis" fontWeight="600">
          {directError}
        </Text>
      ) : null}
    </VStack>
  ) : operation || error ? (
    <VStack align="stretch" spacing={2}>
      {operation ? (
        <Box
          bg="status.success.bg"
          borderWidth="1px"
          borderColor="status.success.border"
          borderRadius="md"
          px={3}
          py={2.5}
        >
          <Text fontSize="xs" fontWeight="600" color="status.success.fg">
            The relay breaks the direct onchain link to your original deposit. Timing,
            matching amounts, or reused addresses can still weaken privacy.
          </Text>
        </Box>
      ) : null}
      {operation?.recipientMatchesDepositor ? (
        <Text role="alert" fontSize="xs" color="status.warning.emphasis" fontWeight="600">
          This recipient is the original depositor, which can weaken privacy.
        </Text>
      ) : null}
      {error ? (
        <Text role="alert" fontSize="xs" color="status.error.emphasis" fontWeight="600">
          {error}
        </Text>
      ) : null}
    </VStack>
  ) : undefined;

  return (
    <>
      <ConfirmationScreen
      title={copy.reviewLabel}
      onBack={isSubmitting || isDirectPreparing ? undefined : onBack}
      outcome={(
        <Box
          bg="surface.raised"
          borderWidth="1px"
          borderColor="border.default"
          borderRadius="lg"
          px={4}
          py={4}
        >
          <HStack justify="space-between" spacing={4} align="center">
            <Box minW={0}>
              <Text fontSize="xs" color="fg.secondary">
                {copy.sourceAmountLabel}
              </Text>
              <Text
                mt={1}
                fontFamily="mono"
                fontSize="xl"
                fontWeight="700"
                lineHeight="shorter"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatShieldWei(inputAmountWei)} ETH
              </Text>
              {sourceAmountUsd ? (
                <Text mt={1} fontSize="xs" color="fg.secondary" fontFamily="mono">
                  {sourceAmountUsd}
                </Text>
              ) : null}
            </Box>
            <Image src={SHIELDED_ETH_LOGO_URL} alt="" boxSize="42px" flexShrink={0} />
          </HStack>

          <ArrowDownIcon my={3} ml={1} boxSize="14px" color="fg.muted" />

          <HStack justify="space-between" spacing={3} align="center">
            <Box minW={0}>
              <Text fontSize="xs" color="fg.secondary">
                {copy.outcomeAmountLabel}
              </Text>
              {method === "relay" && isQuoting ? (
                <Box minH="34px" display="flex" alignItems="center" role="status" aria-label="Checking relay quote">
                  <LoadingDots />
                </Box>
              ) : (
                <Text
                  fontFamily="mono"
                  fontSize="xl"
                  fontWeight="700"
                  lineHeight="shorter"
                  color={recipientAmountWei !== null ? "fg.primary" : "fg.muted"}
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {recipientAmountWei !== null
                    ? `${formatShieldWei(recipientAmountWei)} ETH`
                    : "—"}
                </Text>
              )}
              {recipientAmountUsd ? (
                <Text mt={1} fontSize="xs" color="fg.secondary" fontFamily="mono">
                  {recipientAmountUsd}
                </Text>
              ) : null}
            </Box>
            <Image src={ETH_LOGO_URL} alt="" boxSize="42px" flexShrink={0} />
          </HStack>

          {recipient ? (
            <HStack mt={4} pt={3} borderTopWidth="1px" borderColor="border.subtle" justify="space-between" spacing={3}>
              <Text fontSize="xs" color="fg.secondary">To address</Text>
              <LabeledAddressPopover
                address={recipient}
                contextLabel={copy.recipientContextLabel}
                explorer={explorerUrl}
                label={addressLabel}
                maxW="180px"
              />
            </HStack>
          ) : null}
        </Box>
      )}
      context={hasQuoteValues || error ? (
        <ListSurface>
          <UnshieldDetailRow
            label="Withdrawal method"
            value={directAccount ? (
              <Button
                ref={methodButtonRef}
                variant="unstyled"
                h="auto"
                minH="32px"
                display="inline-flex"
                alignItems="center"
                color="accent.primary"
                fontSize="sm"
                fontWeight="600"
                lineHeight="short"
                rightIcon={<ChevronRightIcon aria-hidden />}
                onClick={methodSheet.onOpen}
              >
                {method === "direct" ? "Receiver pays gas" : "Private relay"}
              </Button>
            ) : "Private relay"}
          />
          {method === "direct" ? (
            <>
              <UnshieldDetailRow label="Receiver amount" value={`${formatShieldWei(inputAmountWei)} ETH`} />
              <UnshieldDetailRow
                label="Network fee"
                value={directController.state.operation?.gasFeeEstimateWei
                  ? `Up to ${formatShieldWei(directController.state.operation.gasFeeEstimateWei)} ETH`
                  : "Calculated before confirmation"}
              />
              <UnshieldDetailRow label="Paid by" value={addressLabel} />
              <UnshieldDetailRow label="Relay fee" value="None" />
            </>
          ) : hasQuoteValues ? (
            <>
              <UnshieldDetailRow
                label="Quoted relay fee"
                errorDetail={warning
                  ? `Above ${SHIELDED_ETH_NETWORK_NAME}'s ${formatRelayFeePercentage(warning.maxFeeBPS)} maximum`
                  : undefined}
                value={(
                  <VStack align="end" spacing={0.5}>
                    <Text as="span" fontSize="sm" fontWeight="700" lineHeight="short">
                      {formatRelayFeePercentage(quotedFeeBPS!)}
                    </Text>
                    <Text
                      as="span"
                      color={warning ? "status.error.fg" : "fg.secondary"}
                      fontSize="2xs"
                      fontWeight="500"
                      lineHeight="short"
                    >
                      {formatShieldWei(relayFeeWei!)} ETH ({relayFeeUsd ?? "$—"})
                    </Text>
                  </VStack>
                )}
              />
              {operation ? (
                <UnshieldDetailRow
                  label="Quote expires"
                  value={<AnimatedQuoteExpiry milliseconds={operation.expiresAt - now} />}
                />
              ) : null}
            </>
          ) : null}
          <UnshieldDetailRow label="Network" value={SHIELDED_ETH_NETWORK_NAME} />
          <UnshieldDetailRow label="Route" value="Privacy Pools" />
          {method === "relay" && relayerName ? <UnshieldDetailRow label="Relayer" value={relayerName} /> : null}
        </ListSurface>
      ) : undefined}
      actionSummary={method === "relay" && (warning || (error && !operation))
        ? recoveryPanel
        : undefined}
      actionNotice={actionNotice}
      confirmAction={method === "direct" ? (
        <Button
          variant="brand"
          onClick={directController.prepare}
          isLoading={directController.state.status === "preparing"}
          loadingText="Generating proof…"
          isDisabled={!directAccount || directController.state.status === "queued"}
        >
          Review
        </Button>
      ) : submitted ? (
        <Button variant="brand" isLoading loadingText="Opening activity…" isDisabled>
          Opening activity…
        </Button>
      ) : isQuoting ? (
        <Button variant="brand" isLoading loadingText="Checking relay…" isDisabled>
          Checking relay…
        </Button>
      ) : warning ? (
        <Button variant="brand" onClick={controller.quote}>
          Check relay again
        </Button>
      ) : expired ? (
        <Button variant="brand" isLoading loadingText="Refreshing quote…" isDisabled>
          Refreshing quote…
        </Button>
      ) : error ? (
        <Button variant="brand" onClick={operation ? onBack : controller.quote}>
          {operation ? "Get a new quote" : "Try again"}
        </Button>
      ) : operation ? (
        <Button
          variant="brand"
          onClick={controller.execute}
          isLoading={isSubmitting}
          loadingText="Preparing proof…"
        >
          {copy.confirmLabel}
        </Button>
      ) : (
        <Button variant="brand" onClick={controller.quote}>
          Get relay quote
        </Button>
      )}
      rejectAction={!submitted ? (
        <Button variant="secondary" onClick={onBack} isDisabled={isSubmitting || isDirectPreparing}>
          Back
        </Button>
      ) : undefined}
      />
      <WithdrawalMethodSheet
        isOpen={methodSheet.isOpen}
        onClose={methodSheet.onClose}
        finalFocusRef={methodButtonRef}
        method={method}
        publicWithdrawAvailable={publicWithdrawAvailable}
        onSelect={(choice) => {
          if (choice === "public") {
            onPublicWithdraw?.();
            return;
          }
          setMethod(choice);
          directController.reset();
        }}
      />
    </>
  );
}
