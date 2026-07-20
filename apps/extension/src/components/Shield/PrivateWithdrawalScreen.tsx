import { useEffect, useState } from "react";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Box, Button, Checkbox, HStack, Text, VStack } from "@chakra-ui/react";
import type { Account } from "@/chrome/types";
import { RecipientPicker } from "@/components/Transfer/RecipientPicker";
import { useTransferRecipient } from "@/components/Transfer/hooks/useTransferRecipient";
import ShieldDashboard from "./ShieldDashboard";
import UnshieldAmountPanel from "./UnshieldAmountPanel";
import PrivateSendReview from "./PrivateSendReview";
import { useShieldInitialization } from "./hooks/useShieldInitialization";
import { useShieldOperations } from "./hooks/useShieldOperations";
import type { ShieldSourceAccount } from "./model/shieldQuote";
import { useUnshield } from "./hooks/useUnshield";
import { usePublicRecovery } from "./hooks/usePublicRecovery";
import PublicRecoveryPanel from "./PublicRecoveryPanel";
import { getPublicWithdrawalOffer } from "./model/recovery";
import type { PrivateWithdrawalIntent } from "./model/unshield";

interface PrivateWithdrawalScreenProps {
  intent: PrivateWithdrawalIntent;
  onBack: () => void;
  onOpenShield: () => void;
  account: ShieldSourceAccount | null;
  accounts?: Account[];
}

const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

/** Shared relay engine with distinct Unshield-to-self and private-send entry points. */
export default function PrivateWithdrawalScreen({
  intent,
  onBack,
  onOpenShield,
  account,
  accounts = [],
}: PrivateWithdrawalScreenProps) {
  const [recoveryAccount, setRecoveryAccount] = useState<ShieldSourceAccount | null>(() => {
    if (account && (account.type === "privateKey" || account.type === "seedPhrase")) {
      return account;
    }
    return accounts.find((candidate) =>
      candidate.type === "privateKey" || candidate.type === "seedPhrase"
    ) ?? null;
  });
  const [acknowledgedPublicExitKey, setAcknowledgedPublicExitKey] = useState<string | null>(null);
  const { initialization, retry } = useShieldInitialization();
  const activity = useShieldOperations();
  const recipientState = useTransferRecipient({
    accounts,
    fromAddress: "",
    chainId: 11_155_111,
    initialRecipient: intent === "unshield" ? account?.address ?? "" : "",
  });
  const withdrawal = useUnshield({
    availableWei: activity.portfolio.maxPrivateSendWei,
    recipient: recipientState.resolvedAddress ?? "",
    onComplete: activity.refresh,
  });
  const publicRecovery = usePublicRecovery(activity.refresh);
  const publicWithdrawalOffer = getPublicWithdrawalOffer({
    account: recoveryAccount,
    recoverableBalanceWei: activity.portfolio.recoverableBalanceWei,
    operations: activity.operations,
  });
  const waitingForAsp = activity.portfolio.pendingBalanceWei > 0n &&
    activity.portfolio.attentionCount === 0;
  const publicExitIsPrimary = Boolean(
    intent === "unshield" &&
    activity.portfolio.maxPrivateSendWei === 0n &&
    publicWithdrawalOffer,
  );
  const publicExitConsentKey = publicExitIsPrimary && publicWithdrawalOffer
    ? `${publicWithdrawalOffer.accountId}:${publicWithdrawalOffer.amountWei.toString()}`
    : "";
  const publicExitAcknowledged = publicExitConsentKey !== "" &&
    acknowledgedPublicExitKey === publicExitConsentKey;

  useEffect(() => {
    setRecoveryAccount((current) => {
      if (current && accounts.some((candidate) =>
        candidate.id === current.id &&
        (candidate.type === "privateKey" || candidate.type === "seedPhrase")
      )) return current;
      return accounts.find((candidate) =>
        candidate.type === "privateKey" || candidate.type === "seedPhrase"
      ) ?? null;
    });
  }, [accounts]);

  useEffect(() => {
    setAcknowledgedPublicExitKey(null);
  }, [publicExitConsentKey]);

  const reviewOpen = Boolean(
    withdrawal.state.operation &&
    ["quoted", "proving", "submitted", "error"].includes(withdrawal.state.status),
  );

  if (reviewOpen) {
    return (
      <PrivateSendReview
        intent={intent}
        controller={withdrawal}
        recipientLabel={recipientState.resolvedName}
        explorerUrl={SEPOLIA_EXPLORER}
        onBack={() => withdrawal.resetQuote()}
      />
    );
  }

  if (recipientState.isRecipientPickerOpen) {
    return (
      <RecipientPicker
        title={intent === "unshield" ? "Receive in" : "My contacts"}
        accounts={recipientState.filteredRecipientAccounts}
        contacts={recipientState.filteredRecipientContacts}
        allContacts={recipientState.allAddressContacts}
        recipient={recipientState.recipient}
        search={recipientState.recipientSearch}
        onSearchChange={recipientState.setRecipientSearch}
        getAccountDisplayName={recipientState.getAccountDisplayName}
        getAccountAvatar={recipientState.getAccountAvatar}
        onSelect={recipientState.selectRecipientAccount}
        onSelectAddress={recipientState.selectRecipientAddress}
        onRemoveContact={recipientState.removeContact}
        onReorderContacts={recipientState.reorderContacts}
        onBack={recipientState.closeRecipientPicker}
      />
    );
  }

  const recipientGatesPass = recipientState.isValid &&
    !recipientState.isResolving &&
    !recipientState.isCheckingRecipientKind &&
    (!recipientState.isRecipientContract || recipientState.acknowledgeContract);
  const canReview = Boolean(
    initialization.status === "ready" &&
    activity.portfolio.maxPrivateSendWei > 0n &&
    withdrawal.validation.valid &&
    recipientGatesPass &&
    withdrawal.state.status !== "quoting",
  );
  const title = intent === "unshield" ? "Unshield" : "Send privately";
  const selectPublicExitDepositAccount = () => {
    if (!publicWithdrawalOffer) return;
    const matching = accounts.find((candidate) =>
      candidate.id === publicWithdrawalOffer.accountId &&
      candidate.address.toLowerCase() === publicWithdrawalOffer.accountAddress.toLowerCase() &&
      (candidate.type === "privateKey" || candidate.type === "seedPhrase")
    );
    if (matching) setRecoveryAccount(matching);
  };

  return (
    <ShieldDashboard
      title={title}
      onBack={onBack}
      initialization={initialization}
      onRetryInitialization={retry}
      content={(
        <UnshieldAmountPanel
          intent={intent}
          availableWei={activity.portfolio.maxPrivateSendWei}
          totalReadyWei={activity.portfolio.readyBalanceWei}
          confirmedWei={activity.portfolio.confirmedBalanceWei}
          pendingWei={activity.portfolio.pendingBalanceWei}
          controller={withdrawal}
          recipientState={recipientState}
          explorerUrl={SEPOLIA_EXPLORER}
          publicExit={intent === "unshield" && publicWithdrawalOffer ? {
            amountWei: publicWithdrawalOffer.amountWei,
            depositAccountAddress: publicWithdrawalOffer.accountAddress,
            waitingForAsp,
            status: publicRecovery.status,
            error: publicRecovery.error,
          } : undefined}
        />
      )}
      recoveryPanel={intent === "unshield" && !publicExitIsPrimary ? (
        <PublicRecoveryPanel
          amountWei={publicWithdrawalOffer?.amountWei ?? 0n}
          depositAccountAddress={publicWithdrawalOffer?.accountAddress ?? ""}
          activeAccountMatches={publicWithdrawalOffer?.activeAccountMatches ?? false}
          waitingForAsp={waitingForAsp}
          isPrimaryRoute={publicExitIsPrimary}
          status={publicRecovery.status}
          error={publicRecovery.error}
          onRecover={() => publicRecovery.prepare(recoveryAccount)}
          onUseDepositAccount={selectPublicExitDepositAccount}
        />
      ) : undefined}
      actionNotice={publicExitIsPrimary ? (
        <VStack align="stretch" spacing={2}>
          {waitingForAsp ? (
            <Box
              role="status"
              px={3}
              py={2.5}
              bg="status.warning.tint"
              borderWidth="1px"
              borderColor="status.warning.border"
              borderRadius="md"
            >
              <HStack align="flex-start" spacing={2}>
                <InfoOutlineIcon
                  boxSize="14px"
                  mt="2px"
                  flexShrink={0}
                  color="status.warning.emphasis"
                  aria-hidden
                />
                <Text fontSize="xs" fontWeight="600" color="fg.primary" lineHeight="short">
                  Compliance check pending. You can still recover this deposit to its original account.
                </Text>
              </HStack>
            </Box>
          ) : null}
          <Checkbox
            w="full"
            minH="44px"
            variant="commitment"
            justifyContent="center"
            isChecked={publicExitAcknowledged}
            onChange={(event) => setAcknowledgedPublicExitKey(
              event.target.checked ? publicExitConsentKey : null,
            )}
          >
            <Text fontSize="sm" fontWeight="600" color="fg.primary" textAlign="center">
              Recover funds back to original address (public transaction)
            </Text>
          </Checkbox>
        </VStack>
      ) : undefined}
      primaryAction={publicExitIsPrimary && publicWithdrawalOffer ? (
        <Button
          variant="brand"
          onClick={() => {
            if (!publicExitAcknowledged) return;
            if (publicWithdrawalOffer.activeAccountMatches) {
              void publicRecovery.prepare(recoveryAccount);
              return;
            }
            selectPublicExitDepositAccount();
          }}
          isLoading={publicWithdrawalOffer.activeAccountMatches && publicRecovery.status === "preparing"}
          loadingText="Preparing public exit…"
          isDisabled={!publicExitAcknowledged || publicRecovery.status === "queued"}
        >
          {publicWithdrawalOffer.activeAccountMatches ? "Withdraw publicly" : "Use deposit account"}
        </Button>
      ) : activity.portfolio.maxPrivateSendWei === 0n ? (
        <Button variant="brand" onClick={onOpenShield}>
          Shield ETH
        </Button>
      ) : (
        <Button
          variant="brand"
          onClick={withdrawal.quote}
          isLoading={withdrawal.state.status === "quoting"}
          loadingText="Checking relay…"
          isDisabled={!canReview}
        >
          {intent === "unshield" ? "Review unshield" : "Review private send"}
        </Button>
      )}
    />
  );
}
