import { memo, useMemo } from "react";
import { Badge, HStack, Text, VStack } from "@chakra-ui/react";
import { getChainConfig } from "@/constants/chainConfig";
import {
  FORCE_INCLUSION_CHAINS,
  isForceInclusionSupportedForAccount,
} from "@/constants/chainRegistry";
import { useNetworks } from "@/contexts/NetworksContext";
import { useBatchPlan } from "@/hooks/useBatchPlan";
import { getNativeAssetMeta, getResolvedChainById } from "@/lib/chains";
import {
  isDarkThemeId,
  useChainBadgeStyle,
  useIconChipBg,
  useStripTokens,
  useTheme,
} from "@/theme";
import { omitOuterValueForEip7702 } from "@/chrome/batchTxHandlers";
import { ConfirmationScreen, OutcomeCard } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import SmartAccountSetupBanner from "@/components/SmartAccountSetupBanner";
import { AdvancedDetails } from "./AdvancedDetails";
import { CallsReview } from "./CallsReview";
import { ConfirmAction, RejectAction } from "./ConfirmationActions";
import { FinancialImpact } from "./FinancialImpact";
import {
  emptyEncodedBatch,
  findMalformedCalldata,
  findMalformedValue,
  getOriginHostname,
  makeSyntheticTxRequest,
  sumNativeValue,
  tryEncodeBatch,
} from "./helpers";
import { RequestContext } from "./RequestContext";
import { RequestMetadataCard } from "./RequestMetadataCard";
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
  const resolvedChain = getResolvedChainById(chainId, networksInfo);
  const chainConfig = getChainConfig(chainId);
  const chainBadgeStyle = useChainBadgeStyle(
    resolvedChain?.bg ?? chainConfig.bg,
    resolvedChain?.text ?? chainConfig.text,
    resolvedChain?.isCustom ?? false,
  );
  const review = useBatchReviewState();
  const fromAddress = params.from || accountAddress;
  const batchPlan = useBatchPlan({
    accountId: batchRequest.accountId ?? null,
    accountType: accountType ?? null,
    chainId,
  });
  const isLocalSigningAccount = accountType === "privateKey" || accountType === "seedPhrase";
  const isAtomic7702 = batchPlan.strategy === "atomic-7702";
  const isNonAtomic = isLocalSigningAccount && !isAtomic7702;
  const nativeAsset = getNativeAssetMeta(chainId, networksInfo);
  const nativeSymbol = nativeAsset?.symbol ?? "ETH";
  const nativeDecimals = nativeAsset?.decimals ?? 18;

  const malformedValueInfo = useMemo(() => findMalformedValue(calls), [calls]);
  const malformedCallInfo = useMemo(() => findMalformedCalldata(calls), [calls]);
  const totalValueWei = useMemo(() => sumNativeValue(calls), [calls]);
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
  const canSplitBatch = isNonAtomic && !customConfirmHandler && !review.forceInclusion && calls.length > 0;
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
  const showAddToBatch = canBatchAccount && !customConfirmHandler && !!onAddedToBatch
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
    : calls.length === 1 ? "Review transaction" : "Review batch";
  const canConfirmBatch = !!customConfirmHandler || accountType !== "impersonator";
  const confirmDisabledReason = actions.isRejecting
    ? "Reject in progress"
    : actions.state === "error"
      ? "Fix the error above before retrying"
      : isValueMalformed
        ? "Transaction value is malformed — signing blocked"
        : encodingError
          ? "Unsafe batch — signing blocked"
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
        outcome={<OutcomeCard
          outcome={calls.length === 1 ? "Execute 1 action" : `Execute ${calls.length} actions together`}
          context={<VStack align="stretch" spacing={2}>
            <Text fontSize="sm">Requested by {getOriginHostname(origin) || origin} on {resolvedChain?.name ?? chainName}</Text>
            <HStack spacing={1.5} flexWrap="wrap">
              <Badge variant={isNonAtomic ? "warning" : "info"}>
                {isNonAtomic ? "Sequential" : "Atomic"}
              </Badge>
              {review.simulationReverted && <Badge variant="error">Likely to fail</Badge>}
              {review.simulationUnavailable && !review.simulationReverted && (
                <Badge variant="warning">Not simulated</Badge>
              )}
            </HStack>
          </VStack>}
        />}
        financialImpact={<FinancialImpact
          totalValueWei={totalValueWei}
          nativeSymbol={nativeSymbol}
          nativeDecimals={nativeDecimals}
          calls={calls}
          syntheticTxRequest={syntheticTxRequest}
          isNonAtomic={isNonAtomic}
          onRevertedChange={review.setSimulationReverted}
          onUnavailableChange={review.setSimulationUnavailable}
        />}
        context={<RequestContext
          calls={calls}
          chainId={chainId}
          currentIndex={currentIndex}
          totalCount={totalCount}
          stripBg={stripBg}
          stripFg={stripFg}
          state={actions.state}
          error={actions.error}
          accountType={accountType}
          customConfirm={!!customConfirmHandler}
          canConfirmBatch={canConfirmBatch}
          confirmDisabledReason={confirmDisabledReason}
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
          metadata={<RequestMetadataCard
            borders={tokens.borders}
            origin={origin}
            originHostname={getOriginHostname(origin)}
            favicon={favicon}
            isInternalWalletChan={origin === "WalletChan" || origin === "Cross-Dapp Batch"}
            iconChipBg={iconChipBg}
            fromAddress={fromAddress}
            chainId={chainId}
            chainName={resolvedChain?.name ?? chainName}
            chainBadgeStyle={chainBadgeStyle}
            forceInclusionInfo={forceInclusionInfo}
            forceInclusion={review.forceInclusion}
            setForceInclusion={review.setForceInclusion}
            showAdvanced={review.showAdvanced}
            setShowAdvanced={review.setShowAdvanced}
            totalValueWei={totalValueWei}
            nativePriceUsd={review.nativePriceUsd}
            nativeSymbol={nativeSymbol}
            nativeDecimals={nativeDecimals}
          />}
          onNavigate={onNavigate}
          onRejectAll={onRejectAll}
        />}
        advancedDetails={<VStack spacing={3} align="stretch">
          <CallsReview
            batchRequestId={batchRequest.id}
            calls={calls}
            chainId={chainId}
            expandedCalls={review.expandedCalls}
            decodedFunctionNames={review.decodedFunctionNames}
            canSplitBatch={canSplitBatch}
            originPerCall={originPerCall}
            onEditCallData={onEditCallData}
            onRemoveCall={onRemoveCall}
            onToggleCall={review.toggleCall}
            onFunctionName={review.recordFunctionName}
            onOpenSplit={review.splitModal.onOpen}
          />
          <AdvancedDetails
            calls={calls}
            fromAddress={fromAddress}
            chainId={chainId}
            accountType={accountType}
            decodedFunctionNames={review.decodedFunctionNames}
            isNonAtomic={isNonAtomic}
            isLocalSigningAccount={isLocalSigningAccount}
            isAtomic7702={isAtomic7702}
            outerEncodedBatch={outerEncodedBatch}
            eip7702Delegate={isAtomic7702 && batchPlan.delegate && batchPlan.needsAuthorization
              ? batchPlan.delegate : undefined}
            forceInclusion={review.forceInclusion}
            showAddToBatch={showAddToBatch}
            addToBatchDisabledReason={addToBatchDisabledReason}
            isAddingToBatch={actions.isAddingToBatch}
            batchedCount={crossDappBatch?.entries.length ?? 0}
            borders={tokens.borders}
            onGasEstimates={review.setCachedGasEstimates}
            onGasValidityChange={review.setGasValid}
            onNativePriceUsd={review.setNativePriceUsd}
            onAnyFailedChange={review.setAnyTxMayRevert}
            onAddToBatch={actions.handleAddBundleToBatch}
          />
        </VStack>}
        confirmAction={canConfirmBatch ? <ConfirmAction
          customConfirm={!!customConfirmHandler}
          confirmDisabled={!!confirmDisabledReason}
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
