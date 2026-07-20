import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { RecipientSection } from "@/components/Transfer/RecipientSection";
import type { TransferRecipient } from "@/components/Transfer/hooks/useTransferRecipient";
import { truncateAddress } from "@/lib/addressUtils";
import type { ReturnTypeUseUnshield } from "./hooks/useUnshield.types";
import {
  ShieldDestinationCard,
  ShieldDirectionMarker,
  ShieldSourceCard,
} from "./ShieldAssetCards";
import { formatShieldWei } from "./model/shieldQuote";
import { SHIELDED_ETH_NETWORK_NAME } from "./model/shieldedAsset";
import {
  getPrivateWithdrawalCopy,
  type PrivateWithdrawalIntent,
} from "./model/unshield";

interface Props {
  intent: PrivateWithdrawalIntent;
  availableWei: bigint;
  totalReadyWei: bigint;
  confirmedWei: bigint;
  pendingWei: bigint;
  controller: ReturnTypeUseUnshield;
  recipientState: TransferRecipient;
  explorerUrl: string;
  publicExit?: {
    amountWei: bigint;
    depositAccountAddress: string;
    waitingForAsp: boolean;
    status: "idle" | "preparing" | "queued" | "error";
    error: string | null;
  };
}

export default function UnshieldAmountPanel({
  intent,
  availableWei,
  totalReadyWei,
  confirmedWei,
  pendingWei,
  controller,
  recipientState,
  explorerUrl,
  publicExit,
}: Props) {
  const copy = getPrivateWithdrawalCopy(intent);
  const operation = controller.state.operation;
  const usesPublicExit = intent === "unshield" && availableWei === 0n && Boolean(publicExit);
  const publicExitAmount = publicExit ? formatShieldWei(publicExit.amountWei) : null;

  const error = !usesPublicExit && controller.state.status === "error"
    ? controller.state.error
    : !usesPublicExit && controller.amount && !controller.validation.valid
      ? "Enter an amount within your available balance."
      : null;
  const balanceLabel = usesPublicExit
    ? publicExit?.waitingForAsp
      ? "Awaiting eligibility"
      : "Public exit available"
    : pendingWei > 0n
      ? `${formatShieldWei(pendingWei)} ETH is still awaiting its check`
      : totalReadyWei > availableWei
        ? `${formatShieldWei(totalReadyWei)} ETH ready · withdraw up to ${formatShieldWei(availableWei)} at a time`
        : availableWei > 0n
          ? copy.availableBalanceLabel
          : confirmedWei > 0n
            ? "No private balance is ready yet"
            : "No Shielded ETH yet";

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <ShieldSourceCard
          label="From"
          shielded
          amount={usesPublicExit ? publicExitAmount ?? "" : controller.amount}
          balanceWei={usesPublicExit ? publicExit?.amountWei ?? 0n : availableWei}
          maxWei={usesPublicExit ? 0n : availableWei}
          balanceLabel={balanceLabel}
          balanceLabelColor={pendingWei > 0n || usesPublicExit ? "accent.highlight" : undefined}
          error={error}
          isDisabled={!usesPublicExit && availableWei === 0n}
          isReadOnly={usesPublicExit}
          onAmountChange={controller.setAmount}
        />
        <ShieldDirectionMarker />
        <ShieldDestinationCard
          shielded={false}
          label={copy.outcomeAmountLabel}
          amount={usesPublicExit ? publicExitAmount : operation ? formatShieldWei(operation.netRecipientAmountWei) : null}
          detail={usesPublicExit
            ? "Returns to the original deposit account"
            : operation
            ? `${formatShieldWei(operation.relayFeeWei)} ETH relayer fee`
            : "Exact amount appears after the relay quote"}
        />
      </Box>

      {usesPublicExit && publicExit ? (
        <Box>
          <Text mb={1} fontSize="sm" fontWeight="600" color="fg.secondary">
            {copy.recipientLabel}
          </Text>
          <HStack
            minH="48px"
            px={3}
            justify="space-between"
            bg="surface.raised"
            borderWidth="1px"
            borderColor="border.default"
            borderRadius="md"
          >
            <Text fontSize="xs" color="fg.secondary">Original deposit account</Text>
            <LabeledAddressPopover
              address={publicExit.depositAccountAddress}
              contextLabel="public exit recipient"
              explorer={explorerUrl}
              label={truncateAddress(publicExit.depositAccountAddress)}
              maxW="160px"
            />
          </HStack>
        </Box>
      ) : (
        <RecipientSection
          recipientState={recipientState}
          explorerUrl={explorerUrl}
          label={copy.recipientLabel}
          chooserLabel={copy.recipientChooserLabel}
        />
      )}

      {operation?.recipientMatchesDepositor && (
        <Box
          role="alert"
          bg="status.warning.bg"
          borderWidth="1px"
          borderColor="status.warning.border"
          borderRadius="md"
          px={3}
          py={2.5}
        >
          <Text fontSize="xs" fontWeight="600" color="status.warning.fg">
            This recipient matches the original depositor. Reusing it can weaken privacy.
          </Text>
        </Box>
      )}

      {usesPublicExit ? (
        (publicExit?.error || publicExit?.status === "queued") ? (
          <Text
            fontSize="xs"
            color={publicExit?.status === "error" ? "status.error.fg" : "fg.secondary"}
            role={publicExit?.status === "error" ? "alert" : "status"}
          >
            {publicExit.error ?? "Open the wallet confirmation to continue."}
          </Text>
        ) : null
      ) : (
        <HStack justify="space-between" spacing={3}>
          <Text fontSize="xs" color="fg.secondary">
            Privacy Pools · {SHIELDED_ETH_NETWORK_NAME}
          </Text>
          <Text fontSize="xs" color="fg.secondary" textAlign="right">
            Sent by a verified relay
          </Text>
        </HStack>
      )}
    </VStack>
  );
}
