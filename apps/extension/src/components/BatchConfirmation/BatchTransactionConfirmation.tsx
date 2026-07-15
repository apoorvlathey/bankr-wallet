import { memo, useMemo } from "react";
import { getChainConfig } from "@/constants/chainConfig";
import {
  FORCE_INCLUSION_CHAINS,
  isForceInclusionSupportedForAccount,
} from "@/constants/chainRegistry";
import { useNetworks } from "@/contexts/NetworksContext";
import { useBatchPlan } from "@/hooks/useBatchPlan";
import { getResolvedChainById } from "@/lib/chains";
import {
  isDarkThemeId,
  useIconChipBg,
  useStripTokens,
  useTheme,
} from "@/theme";
import { omitOuterValueForEip7702 } from "@/chrome/batchTxHandlers";
import { ConfirmationScreen } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
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

function BatchTransactionConfirmation(props: BatchTransactionConfirmationProps) {
  const {
    batchRequest, currentIndex, totalCount, isInSidePanel, accountType,
    accountAddress, onBack, onConfirmed, onRejected, onRejectAll,
    onBeforeReject, onNavigate, onRemoveCall, onEditCallData, originPerCall,
    titleOverride, customConfirmHandler, customRejectHandler, crossDappBatch,
    onAddedToBatch, pageBgColor,
  } = props;
  const { themeId, tokens } = useTheme();
  const { bg: stripBg, fg: stripFg } = useStripTokens();
  const iconChipBg = useIconChipBg();
  const { networksInfo } = useNetworks();
  const { params, origin, chainName, favicon, chainId } = batchRequest;
  const calls = params.calls;
  const isIntakeValidating = batchRequest.intakeStatus === "validating";
  const resolvedChain = getResolvedChainById(chainId, networksInfo);
  const chainConfig = getChainConfig(chainId);
  const review = useBatchReviewState(batchRequest.id, calls.length);
  const fromAddress = params.from || accountAddress;
  const batchPlan = useBatchPlan({
    accountId: batchRequest.accountId ?? null,
    accountType: accountType ?? null,
    chainId,
  });
  const isLocalSigningAccount = accountType === "privateKey" || accountType === "seedPhrase";
  const isAtomic7702 = batchPlan.strategy === "atomic-7702";
  const isNonAtomic = isLocalSigningAccount && !isAtomic7702;
  const resolvedChainName = resolvedChain?.name ?? chainName;
  const originHostname = getOriginHostname(origin);
  const isInternalWalletChan = origin === "WalletChan" || origin === "Cross-Dapp Batch";
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
    if (isAtomic7702 || !isForceInclusionSupportedForAccount(chainId, accountType)) return null;
    const entry = FORCE_INCLUSION_CHAINS.get(chainId)!;
    return { l1ChainId: entry.l1ChainId, l1ChainName: entry.l1ChainName };
  }, [chainId, accountType, isAtomic7702]);
  const actions = useBatchActions({
    batchRequest,
    accountType,
    isInSidePanel,
    isLocalSigningAccount,
    cachedGasEstimates: review.cachedGasEstimates,
    decodedFunctionNames: review.decodedFunctionNames,
    forceInclusion: review.forceInclusion,
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
  const canSplitBatch = !isIntakeValidating && isNonAtomic && !customConfirmHandler
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
  const showAddToBatch = !isIntakeValidating && canBatchAccount && !customConfirmHandler && !!onAddedToBatch
    && !isNonAtomic && !hasDeploymentCall && !isValueMalformed && !encodingError;

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

  const screenTitle = titleOverride
    ? titleOverride.replace(/\s*\([^)]*\)\s*$/, "")
    : calls.length === 1 ? "Transaction request" : "Batch request";
  const canConfirmBatch = !!customConfirmHandler || accountType !== "impersonator";
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
              : !review.gasValid
                ? "Set a valid gas fee — fee fields can't be empty / max fee must cover base + priority"
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
        />}
        financialImpact={<FinancialImpact
          calls={calls}
          syntheticTxRequest={syntheticTxRequest}
          isNonAtomic={isNonAtomic}
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
            onEditCallData={isIntakeValidating ? undefined : onEditCallData}
            onRemoveCall={isIntakeValidating ? undefined : onRemoveCall}
            onToggleCall={review.toggleCall}
            onFunctionName={review.recordFunctionName}
            onClearSigningAction={review.recordClearSigningAction}
          />}
          actionSummary={batchActionSummary}
          state={actions.state}
          error={actions.error}
          accountType={accountType}
          customConfirm={!!customConfirmHandler}
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
        />}
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
