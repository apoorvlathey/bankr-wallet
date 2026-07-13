import { memo, useState } from "react";
import { ConfirmationScreen } from "@/components/ui";
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
import { ForceInclusionScreen, TransactionSentScreen } from "./StateScreens";
import { TransactionContext } from "./TransactionContext";
import {
  TransactionFinancialImpact,
  TransactionOutcome,
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
  const [decodedFunctionName, setDecodedFunctionName] = useState<
    string | undefined
  >();

  const metadata = useTransactionMetadata(
    txRequest,
    resolvedChain?.nativeCurrency.symbol,
  );
  const review = useTransactionReviewState(
    txRequest,
    accountType,
    metadata.nativeSymbol,
  );
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

  const screenTitle = is7702Revoke
    ? "Revoke smart account"
    : is7702SetDelegate
      ? "Set smart account"
      : review.parsedApproval
        ? "Token approval"
        : "Review transaction";
  const outcomeText = is7702Revoke
    ? `Remove smart-account access on ${txRequest.chainName}`
    : is7702SetDelegate
      ? `Enable smart-account access on ${txRequest.chainName}`
      : review.parsedApproval
        ? "Allow this app to spend your tokens"
        : !tx.to
          ? "Deploy a smart contract"
          : decodedFunctionName
            ? `${decodedFunctionName} on ${metadata.originHostname}`
            : review.parsedTxValue.ok && review.parsedTxValue.wei > 0n
              ? `Send ${review.nativeValueDisplay.compact}`
              : `Submit a transaction to ${metadata.originHostname}`;
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
            : !review.gasValid
              ? "Set a valid gas fee — fee fields can't be empty / max fee must cover base + priority"
              : null;
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
      outcome={
        <TransactionOutcome
          txRequest={txRequest}
          outcomeText={outcomeText}
          iconChipBg={iconChipBg}
          isInternalWalletChan={metadata.isInternalWalletChan}
          originHostname={metadata.originHostname}
          originInitials={metadata.originInitials}
          simulationReverted={review.simulationReverted}
          simulationUnavailable={review.simulationUnavailable}
        />
      }
      financialImpact={
        <TransactionFinancialImpact
          txRequest={txRequest}
          parsedTxValue={review.parsedTxValue}
          isValueMalformed={review.isValueMalformed}
          isValueZero={review.isValueZero}
          nativeSymbol={metadata.nativeSymbol}
          nativeValueCompact={review.nativeValueDisplay.compact}
          onRevertedChange={review.setSimulationReverted}
          onSimulationUnavailableChange={review.setSimulationUnavailable}
        />
      }
      context={
        <TransactionContext
          txRequest={txRequest}
          currentIndex={currentIndex}
          totalCount={totalCount}
          accountType={accountType}
          resolvedChainName={resolvedChainName}
          explorer={explorer}
          nativeSymbol={metadata.nativeSymbol}
          iconChipBg={iconChipBg}
          stripBg={stripBg}
          stripFg={stripFg}
          originHostname={metadata.originHostname}
          originInitials={metadata.originInitials}
          isInternalWalletChan={metadata.isInternalWalletChan}
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
          forceInclusion={review.forceInclusion}
          forceInclusionInfo={review.forceInclusionInfo}
          showAdvanced={review.showAdvanced}
          requestState={actions.state}
          requestError={actions.error}
          confirmDisabledReason={confirmDisabledReason}
          gasValid={review.gasValid}
          splitState={review.splitState}
          onNavigate={onNavigate}
          onRejectAll={onRejectAll}
          onClearSigningResolved={(matched) =>
            review.setClearSigningStatus(matched ? "matched" : "absent")
          }
          onToggleAdvanced={() => review.setShowAdvanced(!review.showAdvanced)}
          onForceInclusionChange={review.setForceInclusion}
        />
      }
      advancedDetails={
        <AdvancedDetails
          txRequest={txRequest}
          accountType={accountType}
          gasEstimateKey={review.gasEstimateKey}
          forceInclusion={review.forceInclusion}
          isValueMalformed={review.isValueMalformed}
          clearSigningStatus={review.clearSigningStatus}
          clearSigningMatched={review.clearSigningMatched}
          parsedApproval={review.parsedApproval}
          isErc7715PermissionRevoke={isErc7715PermissionRevoke}
          canBatchAccount={batch.canBatchAccount}
          addToBatchDisabledReason={batch.addToBatchDisabledReason}
          isAddingToBatch={actions.isAddingToBatch}
          batchedCount={batch.batchedCount}
          onGasOverrides={review.setGasOverrides}
          onGasValidityChange={review.setGasValid}
          onFunctionName={setDecodedFunctionName}
          onAddToBatch={actions.handleAddToBatch}
        />
      }
      confirmAction={
        accountType === "impersonator" ? (
          rejectButton
        ) : (
          <ConfirmActionButton
            state={actions.state}
            confirmDisabledReason={confirmDisabledReason}
            onConfirm={actions.handleConfirm}
          />
        )
      }
      rejectAction={accountType === "impersonator" ? undefined : rejectButton}
    />
  );
}

export default memo(TransactionConfirmation);
