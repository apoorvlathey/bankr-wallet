import { memo, useEffect, useMemo, useState } from "react";
import { getChainConfig } from "@/constants/chainConfig";
import { FORCE_INCLUSION_CHAINS, isForceInclusionSupportedForAccount } from "@/constants/chainRegistry";
import { useNetworks } from "@/contexts/NetworksContext";
import { useBatchPlan } from "@/hooks/useBatchPlan";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";
import { getResolvedChainById } from "@/lib/chains";
import {
  isDarkThemeId,
  useIconChipBg,
  useStripTokens,
  useTheme,
} from "@/theme";
import { omitOuterValueForEip7702 } from "@/chrome/batchTxHandlers";
import { ConfirmationScreen } from "@/components/ui";
import { ViewOnlySigningNotice } from "@/components/shared/ViewOnlySigningNotice";
import { CopyButton } from "@/components/CopyButton";
import type { FeePaymentQuoteSummary } from "@/components/FeePaymentSelector";
import { EstimatedChangesHeading } from "@/components/RequestConfirmation/EstimatedChangesHeading";
import { QueueNavigation } from "@/components/RequestConfirmation/QueueNavigation";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";
import { shouldConfirmSimulationFailure } from "@/components/RequestConfirmation/simulationFailure";
import SmartAccountSetupBanner from "@/components/SmartAccountSetupBanner";
import { AdvancedDetails } from "./AdvancedDetails";
import { getBatchActionSummary } from "./batchActionSummary";
import { BatchDecisionSummary } from "./BatchDecisionSummary";
import { CallsReview, CallsReviewHeaderAction } from "./CallsReview";
import { ConfirmAction, RejectAction } from "./ConfirmationActions";
import { FinancialImpact } from "./FinancialImpact";
import {
  emptyEncodedBatch,
  findMalformedCalldata,
  findMalformedValue,
  getBatchEncodingBlockedReason,
  getOriginHostname,
  makeSyntheticTxRequest,
  tryEncodeBatch,
} from "./helpers";
import { RequestContext } from "./RequestContext";
import { RequestWarnings } from "./RequestWarnings";
import { SplitBatchModal } from "./SplitBatchModal";
import { ForceInclusionState, SentState } from "./TerminalStates";
import type { BatchTransactionConfirmationProps, ForceInclusionInfo } from "./types";
import { useBatchActions } from "./useBatchActions";
import { useBatchReviewState } from "./useBatchReviewState";
import { createBatchApprovalCleanup } from "./approvalCleanupAdapter";
import { allowsBatchFeePaymentSelection } from "./feePaymentPolicy";
function BatchTransactionConfirmation(props: BatchTransactionConfirmationProps) {
  const {
    batchRequest, currentIndex, totalCount, isInSidePanel, accountType,
    accountAddress, onBack, onConfirmed, onRejected, onRejectAll,
    onBeforeReject, onNavigate, onRemoveCall, onEditCallData, originPerCall,
    identityIcon, titleOverride, customConfirmHandler, customRejectHandler, crossDappBatch,
    approvalCleanupHandler, approvalCleanupAllHandler, onAddedToBatch,
    pageBgColor, feePaymentRequestKind = "batch", residualApprovalRequest,
  } = props;
  const { themeId, tokens } = useTheme();
  const { bg: stripBg, fg: stripFg } = useStripTokens();
  const iconChipBg = useIconChipBg();
  const { networksInfo } = useNetworks();
  const formatOrigin = useDappOriginFormatter();
  const { params, origin, chainName, favicon, chainId } = batchRequest;
  const calls = params.calls;
  const isPrivacyRagequitBatch = batchRequest.privacyRagequitMeta?.version === 1;
  const [feePaymentToken, setFeePaymentToken] =
    useState<"native" | `0x${string}`>("native");
  const [feePaymentQuote, setFeePaymentQuote] = useState<
    FeePaymentQuoteSummary | null
  >(null);
  const isIntakeValidating = batchRequest.intakeStatus === "validating";
  const resolvedChain = getResolvedChainById(chainId, networksInfo);
  const chainConfig = getChainConfig(chainId);
  const review = useBatchReviewState(batchRequest.id, calls.length);
  const fromAddress = params.from || accountAddress;
  const batchPlan = useBatchPlan({ accountId: batchRequest.accountId ?? null,
    accountType: accountType ?? null, chainId });
  const isLocalSigningAccount = accountType === "privateKey" || accountType === "seedPhrase";
  const isAtomic7702 = batchPlan.strategy === "atomic-7702";
  const isNonAtomic = isLocalSigningAccount && !isAtomic7702;
  const resolvedChainName = resolvedChain?.name ?? chainName;
  const originHostname = formatOrigin(origin).hostname ?? getOriginHostname(origin);
  const isInternalWalletChan = origin === "WalletChan" || origin === "Cross-Dapp Batch" ||
    isPrivacyRagequitBatch;
  const originInitials = (originHostname || origin || "?")
    .split(/[.\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
  const malformedValueInfo = useMemo(() => findMalformedValue(calls), [calls]);
  const malformedCallInfo = useMemo(() => findMalformedCalldata(calls), [calls]);
  const { encodedBatch, encodingError } = useMemo(
    () => malformedValueInfo
      ? emptyEncodedBatch(fromAddress)
      : tryEncodeBatch(calls, fromAddress),
    [calls, fromAddress, malformedValueInfo],
  );
  const outerEncodedBatch = useMemo(
    () => isAtomic7702 ? omitOuterValueForEip7702(encodedBatch) : encodedBatch,
    [encodedBatch, isAtomic7702],
  );
  const syntheticTxRequest = useMemo(
    () => makeSyntheticTxRequest(batchRequest, fromAddress, outerEncodedBatch),
    [batchRequest, fromAddress, outerEncodedBatch],
  );
  const batchActionSummary = useMemo(
    () => getBatchActionSummary({
      calls,
      clearSigningActionNames: review.clearSigningActionNames,
      decodedFunctionNames: review.decodedFunctionNames,
    }),
    [calls, review.clearSigningActionNames, review.decodedFunctionNames],
  );
  const forceInclusionInfo = useMemo<ForceInclusionInfo | null>(() => {
    if (isPrivacyRagequitBatch || isAtomic7702 ||
      !isForceInclusionSupportedForAccount(chainId, accountType)) return null;
    const entry = FORCE_INCLUSION_CHAINS.get(chainId)!;
    if (entry.protocol !== "op-stack") return null;
    return { l1ChainId: entry.l1ChainId, l1ChainName: entry.l1ChainName };
  }, [chainId, accountType, isAtomic7702, isPrivacyRagequitBatch]);
  const allowFeePaymentSelection = allowsBatchFeePaymentSelection({
    customConfirmation: !!customConfirmHandler,
    requestKind: feePaymentRequestKind,
    privacyRagequit: isPrivacyRagequitBatch,
  });
  useEffect(() => {
    if (review.forceInclusion || !allowFeePaymentSelection) {
      setFeePaymentToken("native");
      setFeePaymentQuote(null);
    }
  }, [allowFeePaymentSelection, review.forceInclusion]);
  useEffect(() => {
    setFeePaymentToken("native");
    setFeePaymentQuote(null);
  }, [batchRequest.id, calls]);
  const actions = useBatchActions({
    batchRequest,
    accountType,
    isInSidePanel,
    isLocalSigningAccount,
    cachedGasEstimates: review.cachedGasEstimates,
    decodedFunctionNames: review.decodedFunctionNames,
    forceInclusion: review.forceInclusion,
    feePaymentToken,
    feePaymentQuoteId: feePaymentQuote?.quoteId ?? null,
    customConfirmHandler,
    customRejectHandler,
    onConfirmed,
    onRejected,
    onBeforeReject,
    onAddedToBatch,
    onSplitModalClose: review.splitModal.onClose,
  });
  const isValueMalformed = !!malformedValueInfo;
  const isCalldataMalformed = !!malformedCallInfo;
  const hasDeploymentCall = calls.some((call) => !call.to);
  const canSplitBatch = !isPrivacyRagequitBatch && !isIntakeValidating && isNonAtomic && !customConfirmHandler
    && !review.forceInclusion && calls.length > 0;
  const canBatchAccount = accountType === "bankr" || isLocalSigningAccount;
  const addToBatchDisabledReason = useMemo(() => {
    if (!crossDappBatch) return null;
    if (crossDappBatch.fromAddress.toLowerCase() !== fromAddress.toLowerCase()) {
      return "Pending batch on another account — clear it first.";
    }
    if (crossDappBatch.chainId !== chainId) {
      return `Pending batch on ${crossDappBatch.chainName} — clear it first.`;
    }
    return null;
  }, [crossDappBatch, fromAddress, chainId]);
  const showAddToBatch = !isPrivacyRagequitBatch && !isIntakeValidating && canBatchAccount && !customConfirmHandler && !!onAddedToBatch
    && !isNonAtomic && !hasDeploymentCall && !isValueMalformed && !encodingError;
  const approvalCleanupRequestBlockedReason = isPrivacyRagequitBatch
    ? "Public exit calls cannot be changed."
    : isIntakeValidating
      ? "Wait for request validation to finish."
      : customConfirmHandler && !approvalCleanupHandler
        ? "This assembled batch cannot add cleanup calls from this screen."
        : isValueMalformed || isCalldataMalformed || !!encodingError
          ? "Fix the malformed batch before adding a cleanup call."
          : actions.state !== "ready"
            ? "Wait for the current request action to finish."
            : null;
  const approvalCleanup = createBatchApprovalCleanup({
    accountType,
    batchStrategy: batchPlan.strategy,
    requestBlockedReason: approvalCleanupRequestBlockedReason,
    bundleId: batchRequest.id,
    handler: approvalCleanupHandler,
    allHandler: approvalCleanupAllHandler,
  });
  if (actions.state === "forceInclusion" && forceInclusionInfo) {
    return (
      <ForceInclusionState
        txId={batchRequest.id}
        chainId={chainId}
        info={forceInclusionInfo}
        isInSidePanel={isInSidePanel}
        onConfirmed={onConfirmed}
        onSent={() => actions.setState("sent")}
        onError={() => actions.setState("error")}
      />
    );
  }
  if (actions.state === "sent") {
    return <SentState isDarkTheme={isDarkThemeId(themeId)} borders={tokens.borders} />;
  }

  const screenTitle = isPrivacyRagequitBatch
    ? "Public exit"
    : titleOverride
    ? titleOverride.replace(/\s*\([^)]*\)\s*$/, "")
    : calls.length === 1 ? "Transaction request" : "Batch request";
  const canConfirmBatch =
    !!customConfirmHandler ||
    (accountType !== "impersonator" && accountType !== "ledger");
  const confirmDisabledReason = isIntakeValidating
    ? "Validating request"
    : actions.isRejecting
    ? "Reject in progress"
    : actions.state === "error"
      ? "Fix the error above before retrying"
      : isValueMalformed
        ? "Transaction value is malformed — signing blocked"
        : encodingError
          ? getBatchEncodingBlockedReason(encodingError)
          : isCalldataMalformed
            ? "Calldata is malformed — signing blocked"
            : isLocalSigningAccount && batchPlan.strategy === "loading"
              ? "Checking smart account support"
            : feePaymentToken === "native" && !review.gasValid
                ? "Set a valid gas fee — fee fields can't be empty / max fee must cover base + priority"
                : feePaymentToken !== "native" && !feePaymentQuote?.quoteId
                  ? "Waiting for a bounded fee-token quote"
                : null;
  const rejectAction = (
    <RejectAction
      submitting={actions.state === "submitting"}
      rejecting={actions.isRejecting}
      onReject={actions.handleReject}
    />
  );
  return (
    <>
      <ConfirmationScreen
        title={screenTitle}
        onBack={onBack}
        bg={pageBgColor ?? "surface.base"}
        trailing={<CopyButton label="Copy batch JSON" value={JSON.stringify(calls.map((call) => ({
          to: call.to || null,
          value: call.value && call.value !== "0x0" ? call.value : "0",
          data: call.data || "0x",
        })), null, 2)} />}
        navigation={!isIntakeValidating && totalCount > 1 ? (
          <QueueNavigation
            currentIndex={currentIndex}
            totalCount={totalCount}
            stripBg={stripBg}
            stripFg={stripFg}
            onNavigate={onNavigate}
            onRejectAll={onRejectAll}
          />
        ) : undefined}
        outcome={<RequestIdentity
          origin={origin}
          originHostname={originHostname}
          favicon={favicon}
          iconChipBg={iconChipBg}
          isInternalWalletChan={isInternalWalletChan}
          originInitials={originInitials}
          identityIcon={identityIcon}
        />}
        financialImpact={<FinancialImpact
          calls={calls}
          syntheticTxRequest={syntheticTxRequest}
          isNonAtomic={isNonAtomic}
          approvalCleanup={approvalCleanup}
          residualApprovalRequest={residualApprovalRequest ?? { family: "batchTransaction", requestId: batchRequest.id }}
          onRevertedChange={review.setSimulationReverted}
          onUnavailableChange={review.setSimulationUnavailable}
        />}
        financialImpactTitle={<EstimatedChangesHeading
          chainId={chainId}
          chainName={resolvedChainName}
        />}
        context={<RequestContext
          callList={<CallsReview
            batchRequestId={batchRequest.id}
            calls={calls}
            chainId={chainId}
            expandedCalls={review.expandedCalls}
            decodedFunctionNames={review.decodedFunctionNames}
            originPerCall={originPerCall}
            readOnly={isPrivacyRagequitBatch}
            onEditCallData={isIntakeValidating || isPrivacyRagequitBatch ? undefined : onEditCallData}
            onRemoveCall={isIntakeValidating || isPrivacyRagequitBatch ? undefined : onRemoveCall}
            onToggleCall={review.toggleCall}
            onFunctionName={review.recordFunctionName}
            onClearSigningAction={review.recordClearSigningAction}
          />}
          actionSummary={batchActionSummary}
          state={actions.state}
          error={actions.error}
          warnings={<RequestWarnings
            borders={tokens.borders}
            simulationReverted={review.simulationReverted}
            simulationUnavailable={review.simulationUnavailable}
            anyTxMayRevert={review.anyTxMayRevert}
            malformedCallInfo={malformedCallInfo}
            malformedValueInfo={malformedValueInfo}
            encodingError={encodingError}
          />}
          smartAccountSetup={batchPlan.needsAuthorization && batchPlan.delegate ? (
            <SmartAccountSetupBanner
              delegate={batchPlan.delegate}
              onchainDelegate={batchPlan.onchainDelegate}
              explorerUrl={chainConfig.explorer}
            />
          ) : null}
        />}
        contextHeaderAction={<CallsReviewHeaderAction
          callCount={calls.length}
          canSplitBatch={canSplitBatch}
          onOpenSplit={review.splitModal.onOpen}
        />}
        advancedDetails={
          <AdvancedDetails
            fromAddress={fromAddress}
            chainId={chainId}
            isNonAtomic={isNonAtomic}
            isAtomic7702={isAtomic7702}
            outerEncodedBatch={outerEncodedBatch}
            forceInclusion={review.forceInclusion}
            forceInclusionInfo={forceInclusionInfo}
            showAddToBatch={showAddToBatch}
            addToBatchDisabledReason={addToBatchDisabledReason}
            isAddingToBatch={actions.isAddingToBatch}
            batchedCount={crossDappBatch?.entries.length ?? 0}
            onForceInclusionChange={review.setForceInclusion}
            onAddToBatch={actions.handleAddBundleToBatch}
            feePaymentToken={feePaymentToken}
            feePaymentQuote={feePaymentQuote}
          />
        }
        actionSummary={<BatchDecisionSummary
          calls={calls}
          fromAddress={fromAddress}
          chainId={chainId}
          chainName={resolvedChainName}
          accountType={accountType}
          decodedFunctionNames={review.decodedFunctionNames}
          isNonAtomic={isNonAtomic}
          isLocalSigningAccount={isLocalSigningAccount}
          outerEncodedBatch={outerEncodedBatch}
          eip7702Delegate={isAtomic7702 && batchPlan.delegate && batchPlan.needsAuthorization
            ? batchPlan.delegate : undefined}
          forceInclusion={review.forceInclusion}
          forceInclusionInfo={forceInclusionInfo}
          onGasEstimates={review.setCachedGasEstimates}
          onGasValidityChange={review.setGasValid}
          onAnyFailedChange={review.setAnyTxMayRevert}
          bundleId={batchRequest.id}
          feePaymentToken={feePaymentToken}
          feePaymentQuote={feePaymentQuote}
          allowFeePaymentSelection={allowFeePaymentSelection}
          feePaymentRequestKind={feePaymentRequestKind}
          onFeePaymentTokenChange={setFeePaymentToken}
          onFeePaymentQuoteChange={setFeePaymentQuote}
        />}
        actionNotice={
          accountType === "impersonator" && !customConfirmHandler
            ? <ViewOnlySigningNotice />
            : accountType === "ledger" && !customConfirmHandler
              ? <ViewOnlySigningNotice message="Batch transactions are not supported with Ledger yet." />
              : undefined
        }
        confirmAction={canConfirmBatch ? <ConfirmAction
          customConfirm={!!customConfirmHandler}
          confirmDisabledReason={confirmDisabledReason}
          simulationFailed={shouldConfirmSimulationFailure({
            simulationReverted: review.simulationReverted,
            gasEstimateFailed: review.anyTxMayRevert,
          })}
          submitting={actions.state === "submitting"}
          onConfirm={actions.handleConfirm}
        /> : rejectAction}
        rejectAction={canConfirmBatch ? rejectAction : undefined}
      />
      <SplitBatchModal
        isOpen={review.splitModal.isOpen}
        callCount={calls.length}
        splitting={actions.splitting}
        signingBlocked={isCalldataMalformed || isValueMalformed || !!encodingError}
        onClose={review.splitModal.onClose}
        onConfirm={actions.handleConfirmSplit}
      />
    </>
  );
}

export default memo(BatchTransactionConfirmation);
