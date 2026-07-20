import { useEffect, useState } from "react";
import { Box, Button, HStack, Image, Text, VStack } from "@chakra-ui/react";
import { ArrowDownIcon } from "@chakra-ui/icons";
import { ConfirmationScreen, ListSurface, ListItem, ListItemContent, ListItemMeta, ListItemTitle } from "@/components/ui";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import type { ReturnTypeUseUnshield } from "./hooks/useUnshield.types";
import {
  SHIELDED_ETH_LOGO_URL,
  SHIELDED_ETH_NETWORK_NAME,
} from "./model/shieldedAsset";
import { formatShieldWei } from "./model/shieldQuote";
import type { PrivateWithdrawalIntent } from "./model/unshield";

interface PrivateSendReviewProps {
  intent: PrivateWithdrawalIntent;
  controller: ReturnTypeUseUnshield;
  recipientLabel?: string | null;
  explorerUrl: string;
  onBack: () => void;
}

function formatExpiry(milliseconds: number): string {
  if (milliseconds <= 0) return "Expired";
  const seconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <ListItem density="compact">
      <ListItemContent><ListItemTitle color="fg.secondary">{label}</ListItemTitle></ListItemContent>
      <ListItemMeta color="fg.primary" fontWeight="600">{value}</ListItemMeta>
    </ListItem>
  );
}

export default function PrivateSendReview({
  intent,
  controller,
  recipientLabel,
  explorerUrl,
  onBack,
}: PrivateSendReviewProps) {
  const operation = controller.state.operation;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!operation) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [operation]);

  if (!operation) return null;
  const expired = operation.expiresAt <= now;
  const isSubmitting = controller.state.status === "proving";
  const submitted = controller.state.status === "submitted";
  const error = controller.state.status === "error" ? controller.state.error : null;
  const isUnshield = intent === "unshield";

  return (
    <ConfirmationScreen
      title={isUnshield ? "Review unshield" : "Review private send"}
      onBack={onBack}
      outcome={(
        <Box
          bg="surface.raised"
          borderWidth="1px"
          borderColor="border.default"
          borderRadius="lg"
          px={4}
          py={4}
        >
          <HStack spacing={3} align="center">
            <Image src={SHIELDED_ETH_LOGO_URL} alt="" boxSize="38px" />
            <Box minW={0}>
              <Text fontSize="xs" color="fg.secondary">
                {isUnshield ? "You unshield" : "You send privately"}
              </Text>
              <Text fontFamily="mono" fontSize="2xl" fontWeight="700">
                {formatShieldWei(operation.amountWei)} ETH
              </Text>
            </Box>
          </HStack>
          <ArrowDownIcon my={3} ml={3} color="fg.muted" />
          <HStack justify="space-between" spacing={3} align="center">
            <Box minW={0}>
              <Text fontSize="xs" color="fg.secondary">
                {isUnshield ? "You receive" : "Recipient gets"}
              </Text>
              <Text fontFamily="mono" fontSize="xl" fontWeight="700">
                {formatShieldWei(operation.netRecipientAmountWei)} ETH
              </Text>
            </Box>
            <LabeledAddressPopover
              address={operation.recipient}
              contextLabel={isUnshield ? "unshield recipient" : "private-send recipient"}
              explorer={explorerUrl}
              label={recipientLabel || `${operation.recipient.slice(0, 6)}…${operation.recipient.slice(-4)}`}
              maxW="160px"
            />
          </HStack>
        </Box>
      )}
      financialImpact={(
        <ListSurface>
          <DetailRow label="Private balance debit" value={`${formatShieldWei(operation.amountWei)} ETH`} />
          <DetailRow label="Relayer fee" value={`${formatShieldWei(operation.relayFeeWei)} ETH`} />
          <DetailRow label="Recipient receives" value={`${formatShieldWei(operation.netRecipientAmountWei)} ETH`} />
        </ListSurface>
      )}
      context={(
        <ListSurface>
          <DetailRow label="Network" value={SHIELDED_ETH_NETWORK_NAME} />
          <DetailRow label="Route" value="Privacy Pools" />
          <DetailRow label="Relayer" value={operation.relayerName} />
          <DetailRow label="Quote expires" value={formatExpiry(operation.expiresAt - now)} />
        </ListSurface>
      )}
      actionNotice={(
        <VStack align="stretch" spacing={2}>
          <Box
            bg="status.success.bg"
            borderWidth="1px"
            borderColor="status.success.border"
            borderRadius="md"
            px={3}
            py={2.5}
          >
            <Text fontSize="xs" fontWeight="600" color="status.success.fg">
              The relay breaks the direct onchain link to your original deposit. Timing, matching amounts, or reused addresses can still weaken privacy.
            </Text>
          </Box>
          {operation.recipientMatchesDepositor && (
            <Text role="alert" fontSize="xs" color="status.warning.fg" fontWeight="600">
              This recipient is the original depositor, which can weaken privacy.
            </Text>
          )}
          {error && (
            <Text role="alert" fontSize="xs" color="status.error.fg" fontWeight="600">
              {error}
            </Text>
          )}
        </VStack>
      )}
      confirmAction={submitted ? (
        <Button variant="brand" onClick={onBack}>Done</Button>
      ) : expired || error ? (
        <Button variant="brand" onClick={onBack}>Get a new quote</Button>
      ) : (
        <Button
          variant="brand"
          onClick={controller.execute}
          isLoading={isSubmitting}
          loadingText="Preparing proof…"
        >
          {isUnshield ? "Unshield" : "Send privately"}
        </Button>
      )}
      rejectAction={!submitted ? (
        <Button variant="secondary" onClick={onBack} isDisabled={isSubmitting}>
          Back
        </Button>
      ) : undefined}
    />
  );
}
