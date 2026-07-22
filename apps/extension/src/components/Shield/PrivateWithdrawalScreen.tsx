import { useCallback, useState } from "react";
import { Button } from "@chakra-ui/react";
import type { Account } from "@/chrome/types";
import { PRIVACY_POOLS_RELEASE_POLICY } from "@/chrome/privacy/deployment/manifest";
import { useAccountIdentityLabels } from "@/hooks/useAccountIdentityLabels";
import { RecipientPicker } from "@/components/Transfer/RecipientPicker";
import { useTransferRecipient } from "@/components/Transfer/hooks/useTransferRecipient";
import ShieldDashboard from "./ShieldDashboard";
import UnshieldAmountPanel from "./UnshieldAmountPanel";
import UnshieldReview from "./UnshieldReview";
import { useShieldInitialization } from "./hooks/useShieldInitialization";
import { useShieldOperations } from "./hooks/useShieldOperations";
import type { ShieldSourceAccount } from "./model/shieldQuote";
import { useUnshield } from "./hooks/useUnshield";
import { usePublicRecovery } from "./hooks/usePublicRecovery";
import { useDirectUnshield } from "./hooks/useDirectUnshield";
import PublicRecoveryPanel from "./PublicRecoveryPanel";
import PublicRecoveryReviewScreen from "./PublicRecoveryReviewScreen";
import { getPublicWithdrawalOffer } from "./model/recovery";
import {
  getUnshieldPrefillAmount,
  getUnshieldCopy,
  type UnshieldOperation,
  type UnshieldEntryTarget,
} from "./model/unshield";
import {
  SHIELDED_ETH_CHAIN_ID,
  SHIELDED_ETH_EXPLORER_URL,
} from "./model/shieldedAsset";

interface PrivateWithdrawalScreenProps {
  onBack: () => void;
  account: ShieldSourceAccount | null;
  accounts?: Account[];
  unshieldTarget?: UnshieldEntryTarget | null;
  onUnlockRequired: () => void;
  onUnshieldSubmitted?: (operation: UnshieldOperation) => void;
}

function isRecoveryCapableAccount(account: Pick<Account, "type">): boolean {
  return account.type === "privateKey" || account.type === "seedPhrase" ||
    (account.type === "bankr" &&
      PRIVACY_POOLS_RELEASE_POLICY.bankrMutations === "enabled");
}

function isSigningAccount(
  account: Account,
): account is Extract<Account, { type: "bankr" | "privateKey" | "seedPhrase" }> {
  return isRecoveryCapableAccount(account);
}

/** Relayed Unshield flow with contextual public recovery. */
export default function PrivateWithdrawalScreen({
  onBack,
  account,
  accounts = [],
  unshieldTarget,
  onUnlockRequired,
  onUnshieldSubmitted,
}: PrivateWithdrawalScreenProps) {
  const [runtimeAuthRequired, setRuntimeAuthRequired] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);
  const copy = getUnshieldCopy();
  const accountIdentity = useAccountIdentityLabels(accounts);
  const { initialization, retry } = useShieldInitialization();
  const activity = useShieldOperations();
  const recordWithdrawal = activity.recordWithdrawal;
  const handleUnshieldSubmitted = useCallback((operation: UnshieldOperation) => {
    recordWithdrawal(operation);
    onUnshieldSubmitted?.(operation);
  }, [onUnshieldSubmitted, recordWithdrawal]);
  const markAuthRequired = useCallback(() => {
    setReviewRequested(false);
    setRuntimeAuthRequired(true);
  }, []);
  const authRequired = runtimeAuthRequired ||
    initialization.status === "auth-required";
  const dashboardInitialization = authRequired
    ? { status: "auth-required" as const, error: null }
    : initialization;
  const recipientState = useTransferRecipient({
    accounts,
    fromAddress: "",
    chainId: SHIELDED_ETH_CHAIN_ID,
    initialRecipient: "",
  });
  const withdrawal = useUnshield({
    availableWei: activity.portfolio.maxPrivateSendWei,
    recipient: recipientState.resolvedAddress ?? "",
    initialAmount: getUnshieldPrefillAmount(unshieldTarget),
    onComplete: activity.refresh,
    onSubmitted: handleUnshieldSubmitted,
    onAuthRequired: markAuthRequired,
  });
  const directRecipientAccount = recipientState.resolvedAddress
    ? accounts.filter(isSigningAccount).find((candidate) =>
        candidate.address.toLowerCase() === recipientState.resolvedAddress?.toLowerCase()
      ) ?? null
    : null;
  const directWithdrawal = useDirectUnshield({
    amountWei: withdrawal.amountValidation.valid
      ? withdrawal.amountValidation.amountWei
      : null,
    recipient: recipientState.resolvedAddress ?? "",
    account: directRecipientAccount,
    onAuthRequired: markAuthRequired,
    onQueued: recordWithdrawal,
  });
  const publicRecovery = usePublicRecovery(
    activity.refresh,
    markAuthRequired,
  );
  const privateRelayUnavailable = withdrawal.state.status === "fee-warning" ||
    (withdrawal.state.status === "error" && withdrawal.state.operation === null);
  const recipientPublicWithdrawalOffer = directRecipientAccount
    ? getPublicWithdrawalOffer({
        account: directRecipientAccount,
        recoverableBalanceWei: activity.portfolio.recoverableBalanceWei,
        operations: activity.operations,
        preferredOperationId: unshieldTarget?.operationId ?? null,
        allowPrivateReady: true,
      })
    : null;
  const recipientCanPublicWithdraw = Boolean(
    recipientPublicWithdrawalOffer && recipientState.resolvedAddress &&
    recipientPublicWithdrawalOffer.accountAddress.toLowerCase() ===
      recipientState.resolvedAddress.toLowerCase(),
  );
  const preferredRecoveryAccount = account && isRecoveryCapableAccount(account)
    ? account
    : accounts.find(isRecoveryCapableAccount) ?? null;
  const publicWithdrawalOffer = getPublicWithdrawalOffer({
    account: preferredRecoveryAccount,
    recoverableBalanceWei: activity.portfolio.recoverableBalanceWei,
    operations: activity.operations,
    preferredOperationId: unshieldTarget?.operationId ?? null,
    allowPrivateReady: privateRelayUnavailable,
  });
  const waitingForAsp = activity.portfolio.pendingBalanceWei > 0n &&
    activity.portfolio.attentionCount === 0;
  const publicExitIsPrimary = Boolean(
    publicWithdrawalOffer &&
    !privateRelayUnavailable &&
    (activity.portfolio.maxPrivateSendWei === 0n || unshieldTarget),
  );
  const hasReviewPublicExit = Boolean(
    privateRelayUnavailable && publicWithdrawalOffer,
  );
  const depositAccount = publicWithdrawalOffer
    ? accounts.find((candidate) =>
        candidate.id === publicWithdrawalOffer.accountId &&
        candidate.address.toLowerCase() === publicWithdrawalOffer.accountAddress.toLowerCase() &&
        candidate.type === publicWithdrawalOffer.accountType &&
        isRecoveryCapableAccount(candidate)
      ) ?? null
    : null;
  const recoveryDisplayName = depositAccount
    ? accountIdentity.getDisplayName(depositAccount)
    : null;
  const recoveryEnsAvatar = depositAccount
    ? accountIdentity.getEnsAvatar(depositAccount)
    : null;
  const recoverySecondaryIdentity = depositAccount
    ? accountIdentity.getSecondaryIdentity(depositAccount)
    : null;

  if (publicRecovery.previews.length > 0) {
    const reviewOptions = publicRecovery.previews.map((preview) => {
      const optionAccount = accounts.find((candidate) =>
        candidate.id === preview.accountId &&
        candidate.address.toLowerCase() === preview.accountAddress.toLowerCase() &&
        candidate.type === preview.accountType &&
        isRecoveryCapableAccount(candidate)
      ) ?? null;
      return {
        preview,
        depositAccount: optionAccount,
        displayName: optionAccount
          ? accountIdentity.getDisplayName(optionAccount)
          : null,
        ensAvatar: optionAccount
          ? accountIdentity.getEnsAvatar(optionAccount)
          : null,
        secondaryIdentity: optionAccount
          ? accountIdentity.getSecondaryIdentity(optionAccount)
          : null,
      };
    });
    return (
      <PublicRecoveryReviewScreen
        key={publicRecovery.previews.map((preview) => preview.commitmentId).join(":")}
        options={reviewOptions}
        initialization={dashboardInitialization}
        status={publicRecovery.status}
        error={publicRecovery.error}
        onBack={publicRecovery.resetPreview}
        onRetryInitialization={retry}
        onUnlockRequired={onUnlockRequired}
        onRecover={(previews) => {
          const preview = previews[0];
          if (!preview) return;
          const signer = accounts.find((candidate) =>
            candidate.id === preview.accountId &&
            candidate.address.toLowerCase() === preview.accountAddress.toLowerCase() &&
            candidate.type === preview.accountType &&
            isRecoveryCapableAccount(candidate)
          ) ?? null;
          publicRecovery.prepare(signer, previews);
        }}
      />
    );
  }

  if (reviewRequested && !authRequired) {
    return (
      <UnshieldReview
        controller={withdrawal}
        recipientLabel={recipientState.resolvedName}
        explorerUrl={SHIELDED_ETH_EXPLORER_URL}
        nativePriceUsd={activity.series.priceUsd}
        recoveryPanel={hasReviewPublicExit ? (
          <PublicRecoveryPanel
            amountWei={publicWithdrawalOffer?.amountWei ?? 0n}
            depositAccountAddress={publicWithdrawalOffer?.accountAddress ?? ""}
            depositAccount={depositAccount}
            displayName={recoveryDisplayName}
            ensAvatar={recoveryEnsAvatar}
            secondaryIdentity={recoverySecondaryIdentity}
            canReview={Boolean(publicWithdrawalOffer)}
            status={publicRecovery.status}
            error={publicRecovery.error}
            onReview={() => publicRecovery.inspect(unshieldTarget?.operationId ?? null)}
          />
        ) : undefined}
        publicWithdrawAvailable={recipientCanPublicWithdraw}
        onPublicWithdraw={recipientPublicWithdrawalOffer ? () =>
          publicRecovery.inspect(recipientPublicWithdrawalOffer.sourceOperationId)
        : undefined}
        directAccount={directRecipientAccount}
        directController={directWithdrawal}
        onBack={() => {
          withdrawal.resetQuote();
          directWithdrawal.reset();
          setReviewRequested(false);
        }}
      />
    );
  }

  if (recipientState.isRecipientPickerOpen) {
    return (
      <RecipientPicker
        title={copy.recipientPickerTitle}
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
    dashboardInitialization.status === "ready" &&
    activity.portfolio.maxPrivateSendWei > 0n &&
    withdrawal.validation.valid &&
    recipientGatesPass &&
    withdrawal.state.status !== "quoting",
  );
  const reviewPublicExit = () => {
    if (!publicWithdrawalOffer) return;
    publicRecovery.inspect(unshieldTarget?.operationId ?? null);
  };

  return (
    <ShieldDashboard
      title={copy.title}
      onBack={onBack}
      initialization={dashboardInitialization}
      onRetryInitialization={retry}
      onUnlockRequired={onUnlockRequired}
      content={(
        <UnshieldAmountPanel
          availableWei={activity.portfolio.maxPrivateSendWei}
          totalReadyWei={activity.portfolio.readyBalanceWei}
          confirmedWei={activity.portfolio.confirmedBalanceWei}
          pendingWei={activity.portfolio.pendingBalanceWei}
          controller={withdrawal}
          recipientState={recipientState}
          explorerUrl={SHIELDED_ETH_EXPLORER_URL}
          nativePriceUsd={activity.series.priceUsd}
          publicExit={publicWithdrawalOffer ? {
            amountWei: publicWithdrawalOffer.amountWei,
            depositAccountAddress: publicWithdrawalOffer.accountAddress,
            waitingForAsp,
            isPrimaryRoute: publicExitIsPrimary,
          } : undefined}
        />
      )}
      primaryAction={publicExitIsPrimary && publicWithdrawalOffer ? (
        <Button
          variant="brand"
          onClick={reviewPublicExit}
          isLoading={publicRecovery.status === "previewing"}
          loadingText="Checking public exit…"
          isDisabled={publicRecovery.status === "queued"}
        >
          Review public exit
        </Button>
      ) : (
        <Button
          variant="brand"
          onClick={() => {
            setReviewRequested(true);
            void withdrawal.quote();
          }}
          isDisabled={!canReview}
        >
          {copy.reviewLabel}
        </Button>
      )}
    />
  );
}
