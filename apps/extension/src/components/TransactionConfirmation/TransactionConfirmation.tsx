import { memo, useEffect, useState } from "react";
import { ConfirmationScreen } from "@/components/ui";
import { ViewOnlySigningNotice } from "@/components/shared/ViewOnlySigningNotice";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { useIconChipBg, useStripTokens } from "@/theme";
import { AdvancedDetails } from "./AdvancedDetails";
import {
  ConfirmActionButton,
  RejectActionButton,
} from "./ConfirmationActions";
import { CopyButton } from "./CopyButton";
import type { FeePaymentQuoteSummary } from "@/components/FeePaymentSelector";
import { QueueNavigation } from "./QueueNavigation";
import { shouldConfirmSimulationFailure } from "@/components/RequestConfirmation/simulationFailure";
import { ForceInclusionScreen, TransactionSentScreen } from "./StateScreens";
import { TransactionContext } from "./TransactionContext";
import { TransactionDecisionSummary } from "./TransactionDecisionSummary";
import { getDecodedActionFallback } from "./transactionPresentation";
import {
  TransactionEstimatedChangesTitle,
  TransactionFinancialImpact,
  TransactionOutcome,
  PrivacyShieldRequestContext,
  PrivacyShieldTransactionOutcome,
} from "./TransactionSummary";
import type { TransactionConfirmationProps } from "./types";
import { useTransactionActions } from "./useTransactionActions";
import { useTransactionBatchEligibility } from "./useTransactionBatchEligibility";
import { useTransactionMetadata } from "./useTransactionMetadata";
import { useTransactionReviewState } from "./useTransactionReviewState";

function TransactionConfirmation({
  txRequest,
  currentIndex,
  totalCount,
  isInSidePanel,
  accountType,
  onBack,
  onConfirmed,
  onRejected,
  onRejectAll,
  onBeforeReject,
  onNavigate,
  crossDappBatch,
  onAddedToBatch,
}: TransactionConfirmationProps) {
  const { networksInfo } = useNetworks();
  const { bg: stripBg, fg: stripFg } = useStripTokens();
  const iconChipBg = useIconChipBg();
  const { tx } = txRequest;
  const resolvedChain = getResolvedChainById(tx.chainId, networksInfo);
  const chainConfig = getChainConfig(tx.chainId);
  const resolvedChainName = resolvedChain?.name ?? txRequest.chainName;
  const explorer = resolvedChain?.explorer || chainConfig.explorer;
  const delegation7702 = txRequest.delegation7702Meta;
  const is7702Revoke = delegation7702?.kind === "revoke";
  const is7702SetDelegate = delegation7702?.kind === "setDelegate";
  const isErc7715PermissionRevoke =
    !!txRequest.erc7715PermissionRevokeMeta;
  const isPrivacyShield = !!txRequest.privacyShieldMeta;
  const [decodedFunctionName, setDecodedFunctionName] = useState<
    string | undefined
  >();
  const [feePaymentToken, setFeePaymentToken] = useState<"native" | `0x${string}`>(
    "native",
  );
  const [feePaymentQuote, setFeePaymentQuote] =
    useState<FeePaymentQuoteSummary | null>(null);

  const metadata = useTransactionMetadata(
    txRequest,
    resolvedChain?.nativeCurrency.symbol,
  );
  const review = useTransactionReviewState(
    txRequest,
    accountType,
  );
  useEffect(() => {
    if (review.forceInclusion) {
      setFeePaymentToken("native");
      setFeePaymentQuote(null);
    }
  }, [review.forceInclusion]);
  useEffect(() => {
    setFeePaymentToken("native");
    setFeePaymentQuote(null);
  }, [txRequest.id]);
  const batch = useTransactionBatchEligibility(
    txRequest,
    accountType,
    crossDappBatch,
    review.isValueMalformed,
  );
  const actions = useTransactionActions({
    txRequest,
    accountType,
    isInSidePanel,
    isErc7715PermissionRevoke,
    is7702Revoke,
    is7702SetDelegate,
    decodedFunctionName,
    gasOverrides: review.gasOverrides,
    forceInclusion: review.forceInclusion,
    feePaymentToken,
    feePaymentQuoteId: feePaymentQuote?.quoteId ?? null,
    onConfirmed,
    onRejected,
    onBeforeReject,
    onAddedToBatch,
  });

  if (actions.state === "forceInclusion" && review.forceInclusionInfo) {
    return (
      <ForceInclusionScreen
        txId={txRequest.id}
        l2ChainId={tx.chainId}
        info={review.forceInclusionInfo}
        onComplete={actions.handleForceInclusionComplete}
        onError={actions.handleForceInclusionError}
      />
    );
  }
  if (actions.state === "sent") return <TransactionSentScreen />;

  const screenTitle = isPrivacyShield
    ? "Review shield"
    : is7702Revoke
    ? "Revoke smart account"
    : is7702SetDelegate
      ? "Set smart account"
      : review.parsedApproval
        ? "Token approval"
        : "Transaction request";
  const confirmDisabledReason = actions.isRejecting
    ? "Reject in progress"
    : actions.state === "error"
      ? "Fix the error above before retrying"
      : review.isCalldataMalformed
        ? "Calldata is malformed — signing blocked"
        : review.isValueMalformed
          ? "Transaction value is malformed — signing blocked"
          : !review.splitState.ready
            ? review.splitState.label || "Waiting for prior transaction to land"
            : feePaymentToken === "native" && !review.gasValid
              ? "Set a valid gas fee — fee fields can't be empty / max fee must cover base + priority"
              : feePaymentToken !== "native" && !feePaymentQuote?.quoteId
                ? "Waiting for a bounded fee-token quote"
              : null;
  const decodedActionFallback = getDecodedActionFallback({
    clearSigningStatus: review.clearSigningStatus,
    decodedFunctionName,
    hasSpecializedSummary: Boolean(
      review.parsedApproval || isErc7715PermissionRevoke,
    ),
  });
  const rejectButton = (
    <RejectActionButton
      state={actions.state}
      isRejecting={actions.isRejecting}
      onReject={actions.handleReject}
    />
  );

  return (
    <ConfirmationScreen
      title={screenTitle}
      onBack={onBack}
      trailing={
        <CopyButton
          label="Copy transaction JSON"
          value={JSON.stringify(
            {
              to: tx.to || null,
              value: review.parsedTxValue.ok
                ? review.parsedTxValue.wei.toString()
                : String(tx.value ?? ""),
              data: tx.data || "0x",
            },
            null,
            2,
          )}
        />
      }
      navigation={
        totalCount > 1 ? (
          <QueueNavigation
            currentIndex={currentIndex}
            totalCount={totalCount}
            stripBg={stripBg}
            stripFg={stripFg}
            onNavigate={onNavigate}
            onRejectAll={onRejectAll}
          />
        ) : undefined
      }
      outcome={
        isPrivacyShield ? (
          <PrivacyShieldTransactionOutcome txRequest={txRequest} />
        ) : <TransactionOutcome
          txRequest={txRequest}
          iconChipBg={iconChipBg}
          isInternalWalletChan={metadata.isInternalWalletChan}
          originHostname={metadata.originHostname}
          originInitials={metadata.originInitials}
        />
      }
      financialImpact={
        delegation7702 ? undefined : (
          <TransactionFinancialImpact
            txRequest={txRequest}
            isValueMalformed={review.isValueMalformed}
            isValueZero={review.isValueZero}
            onRevertedChange={review.setSimulationReverted}
            onSimulationUnavailableChange={review.setSimulationUnavailable}
          />
        )
      }
      financialImpactTitle={
        delegation7702 ? undefined : (
          <TransactionEstimatedChangesTitle
            txRequest={txRequest}
            resolvedChainName={resolvedChainName}
          />
        )
      }
      context={
        isPrivacyShield ? (
          <PrivacyShieldRequestContext />
        ) : <TransactionContext
          txRequest={txRequest}
          actionLabel={decodedActionFallback}
          explorer={explorer}
          nativeSymbol={metadata.nativeSymbol}
          nativePriceUsd={review.nativePriceUsd}
          toLabels={metadata.toLabels}
          delegateLabels={metadata.delegateLabels}
          resolvedToName={metadata.resolvedToName}
          parsedApproval={review.parsedApproval}
          isValueZero={review.isValueZero}
          isValueMalformed={review.isValueMalformed}
          calldataValidation={review.calldataValidation}
          clearSigningEligible={review.clearSigningEligible}
          simulationReverted={review.simulationReverted}
          simulationUnavailable={review.simulationUnavailable}
          requestState={actions.state}
          requestError={actions.error}
          gasValid={review.gasValid}
          splitState={review.splitState}
          onClearSigningResolved={(matched) =>
            review.setClearSigningStatus(matched ? "matched" : "absent")
          }
        />
      }
      advancedDetails={
        <AdvancedDetails
          txRequest={txRequest}
          clearSigningStatus={review.clearSigningStatus}
          clearSigningMatched={review.clearSigningMatched}
          parsedApproval={review.parsedApproval}
          isErc7715PermissionRevoke={isErc7715PermissionRevoke}
          canBatchAccount={batch.canBatchAccount}
          addToBatchDisabledReason={batch.addToBatchDisabledReason}
          isAddingToBatch={actions.isAddingToBatch}
          batchedCount={batch.batchedCount}
          forceInclusion={review.forceInclusion}
          forceInclusionInfo={review.forceInclusionInfo}
          onFunctionName={setDecodedFunctionName}
          onAddToBatch={actions.handleAddToBatch}
          onForceInclusionChange={review.setForceInclusion}
          feePaymentToken={feePaymentToken}
          feePaymentQuote={feePaymentQuote}
        />
      }
      actionSummary={
        <TransactionDecisionSummary
          txRequest={txRequest}
          accountType={accountType}
          gasEstimateKey={review.gasEstimateKey}
          forceInclusion={review.forceInclusion}
          forceInclusionInfo={review.forceInclusionInfo}
          destinationChainName={resolvedChainName}
          isValueMalformed={review.isValueMalformed}
          onGasOverrides={review.setGasOverrides}
          onGasValidityChange={review.setGasValid}
          feePaymentToken={feePaymentToken}
          feePaymentQuote={feePaymentQuote}
          onFeePaymentTokenChange={setFeePaymentToken}
          onFeePaymentQuoteChange={setFeePaymentQuote}
        />
      }
      actionNotice={
        accountType === "impersonator" ? <ViewOnlySigningNotice /> : undefined
      }
      confirmAction={
        accountType === "impersonator" ? (
          rejectButton
        ) : (
          <ConfirmActionButton
            state={actions.state}
            confirmDisabledReason={confirmDisabledReason}
            simulationFailed={shouldConfirmSimulationFailure({
              simulationReverted: review.simulationReverted,
            })}
            onConfirm={actions.handleConfirm}
          />
        )
      }
      rejectAction={accountType === "impersonator" ? undefined : rejectButton}
    />
  );
}

export default memo(TransactionConfirmation);
