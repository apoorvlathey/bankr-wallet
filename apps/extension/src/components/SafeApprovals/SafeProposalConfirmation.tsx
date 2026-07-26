import { Button } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { isPendingSafeProposal } from "@/chrome/safe/proposalStatus";
import type { SafeChainSnapshot, SafeProposalRecord } from "@/chrome/safe/types";
import type { Account, SafeAccount } from "@/chrome/types";
import type { GasOverrides } from "@/chrome/txHandlers";
import { CopyButton } from "@/components/CopyButton";
import { LedgerSigningStatus } from "@/components/Ledger/LedgerSigningStatus";
import { EstimatedChangesHeading } from "@/components/RequestConfirmation/EstimatedChangesHeading";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";
import { SimulationFailureConfirmButton } from "@/components/RequestConfirmation/SimulationFailureConfirmButton";
import { shouldConfirmSimulationFailure } from "@/components/RequestConfirmation/simulationFailure";
import { ConfirmationScreen } from "@/components/ui";
import { useIconChipBg } from "@/theme";
import type { FeePaymentQuoteSummary } from "@/components/FeePaymentSelector";
import { SafeProposalAdvancedDetails } from "./SafeProposalAdvancedDetails";
import { SafeProposalDecisionSummary } from "./SafeProposalDecisionSummary";
import { SafeProposalFinancialImpact } from "./SafeProposalFinancialImpact";
import { useSafeExecutionRefresh } from "./hooks/useSafeExecutionRefresh";
import { useSafeProposalActions } from "./hooks/useSafeProposalActions";
import {
  SafeProposalRequestDetails,
  SafeProposalStatusPill,
} from "./SafeProposalRequestDetails";
import {
  canRejectSafeProposal,
  getAvailableSafeOwnerAccounts,
  getDefaultSafeExecutorAccountId,
  getSafeExecutionBlockedReason,
  getSafeExecutorAccounts,
  getSafeOwnerAccounts,
  getSafeProposalActionKind,
  hasSafeProposalSignatures,
  makeSafeExecutionTxRequest,
  makeSafeReviewTxRequest,
} from "./safeProposalActionModel";

function send<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function originHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}
export function SafeProposalConfirmation({
  safeAccount,
  proposal,
  snapshot,
  accounts,
  chainName,
  explorer,
  backLabel = "Back to requests",
  onBack,
  onOpenProposal,
  onReload,
  onExecutionSubmitted,
}: {
  safeAccount: SafeAccount;
  proposal: SafeProposalRecord;
  snapshot: SafeChainSnapshot;
  accounts: Account[];
  chainName: string;
  explorer?: string;
  backLabel?: string;
  onBack: () => void;
  onOpenProposal: (proposalId: string) => void;
  onReload: () => Promise<void>;
  onExecutionSubmitted: () => void;
}) {
  const iconChipBg = useIconChipBg();
  const [ownerAccountId, setOwnerAccountId] = useState<string | null>(null);
  const [executorAccountId, setExecutorAccountId] = useState<string | null>(null);
  const [gasOverrides, setGasOverrides] = useState<GasOverrides | null>(null);
  const [gasValid, setGasValid] = useState(false);
  const [feePaymentToken, setFeePaymentToken] = useState<"native" | `0x${string}`>("native");
  const [feePaymentQuote, setFeePaymentQuote] = useState<FeePaymentQuoteSummary | null>(null);
  const [simulationReverted, setSimulationReverted] = useState(false);
  const [simulationUnavailable, setSimulationUnavailable] = useState(false);
  const [reviewFresh, setReviewFresh] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submissionLocked, setSubmissionLocked] = useState(false);

  const ownerAccounts = useMemo(() => getSafeOwnerAccounts(accounts, snapshot), [accounts, snapshot]);
  const safeOwnerAccountIds = useMemo(
    () => new Set(ownerAccounts.map((account) => account.id)),
    [ownerAccounts],
  );
  const availableOwners = useMemo(
    () => getAvailableSafeOwnerAccounts(accounts, snapshot, proposal),
    [accounts, proposal, snapshot],
  );
  const executors = useMemo(() => getSafeExecutorAccounts(accounts, snapshot), [accounts, snapshot]);
  const actionKind = getSafeProposalActionKind(proposal, availableOwners, snapshot);
  const isRequestView = isPendingSafeProposal(proposal);
  const isRejection = proposal.purpose === "rejection";
  const requiresOnchainRejection = hasSafeProposalSignatures(proposal);
  const executionPending = ["ambiguous", "executing"].includes(proposal.state) &&
    (!!proposal.transactionHash || !!proposal.userOperationHash);
  useSafeExecutionRefresh({ pending: executionPending, proposalId: proposal.id, onReload });

  useEffect(() => {
    if (!availableOwners.some((account) => account.id === ownerAccountId)) {
      setOwnerAccountId(availableOwners[0]?.id ?? null);
    }
  }, [availableOwners, ownerAccountId]);

  useEffect(() => {
    if (!executors.some((account) => account.id === executorAccountId)) {
      setExecutorAccountId(getDefaultSafeExecutorAccountId(executors, snapshot));
    }
  }, [executorAccountId, executors, snapshot]);

  useEffect(() => {
    if (submissionLocked) return;
    setGasOverrides(null);
    setGasValid(actionKind !== "execute");
    setFeePaymentToken("native");
    setFeePaymentQuote(null);
  }, [actionKind, executorAccountId, proposal.id, submissionLocked]);

  useEffect(() => {
    if (submissionLocked) return;
    if (!isRequestView) {
      setReviewFresh(true);
      setReviewError(null);
      setSimulationReverted(false);
      setSimulationUnavailable(false);
      return;
    }
    let active = true;
    setReviewFresh(false);
    setSimulationReverted(false);
    setSimulationUnavailable(false);
    setReviewError(null);
    void (async () => {
      try {
        const refreshed = await send<{
          success?: boolean;
          record?: { chains: Record<string, SafeChainSnapshot> };
          error?: string;
        }>({
          type: "refreshSafeAccount",
          accountId: safeAccount.id,
          chainId: proposal.chainId,
        });
        if (refreshed.success === false || !refreshed.record) {
          throw new Error(refreshed.error || "Could not refresh Safe authority");
        }
        const live = refreshed.record.chains[String(proposal.chainId)];
        if (!live || live.configEpoch !== proposal.safeConfigEpoch) {
          throw new Error("Safe configuration changed; review this request again");
        }
        if (["publishing", "awaitingApprovals", "readyToExecute"].includes(proposal.state)) {
          await send({
            type: "reconcileSafeProposal",
            proposalId: proposal.id,
          }).catch(() => undefined);
        }
        if (active) {
          await onReload();
          setReviewFresh(true);
        }
      } catch (caught) {
        if (active) {
          setReviewError(caught instanceof Error ? caught.message : "Could not refresh Safe request");
        }
      }
    })();
    return () => { active = false; };
    // The immutable proposal ID and request/detail mode are the review
    // boundary. Reconciliation writes within one pending state must not
    // restart the authority refresh loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRequestView, proposal.id, submissionLocked]);

  const reviewRequest = useMemo(
    () => makeSafeReviewTxRequest(proposal, chainName),
    [chainName, proposal],
  );
  const selectedOwner = availableOwners.find((account) => account.id === ownerAccountId) ?? null;
  const selectedExecutor = executors.find((account) => account.id === executorAccountId) ?? null;
  const {
    busy,
    error: actionError,
    handleConfirm,
    handleNonceChange,
    handleReject,
    notice,
    operation,
    primaryActionKind,
    runAction,
  } = useSafeProposalActions({
    proposal,
    actionKind,
    selectedOwner,
    selectedExecutor,
    gasOverrides,
    feePaymentToken,
    feePaymentQuote,
    onBack,
    onOpenProposal,
    onReload,
  });
  const error = actionError ?? reviewError;
  const displayRequestView = isRequestView || submissionLocked;
  const selectedAccount = primaryActionKind === "execute"
    ? selectedExecutor
    : operation === "approve"
      ? ownerAccounts.find((account) => account.id === ownerAccountId) ?? null
      : selectedOwner;
  const isLedgerWaiting =
    selectedAccount?.type === "ledger" &&
    (operation === "approve" || operation === "execute");
  const actionAccounts = primaryActionKind === "execute"
    ? executors
    : operation === "approve"
      ? ownerAccounts
      : availableOwners;
  const executionBlockedReason = primaryActionKind === "execute" ? getSafeExecutionBlockedReason(proposal, snapshot) : null;
  const executionRequest = useMemo<PendingTxRequest | null>(
    () => primaryActionKind === "execute" && selectedExecutor && !executionBlockedReason
      ? makeSafeExecutionTxRequest(proposal, chainName, selectedExecutor)
      : null,
    [chainName, executionBlockedReason, primaryActionKind, proposal, selectedExecutor],
  );

  const canReject = canRejectSafeProposal(proposal);
  const disabledReason = !reviewFresh
    ? "Refreshing Safe authority"
    : executionBlockedReason
      ? executionBlockedReason
      : !selectedAccount
        ? primaryActionKind === "execute" ? "No local execution account is available" : "No available Safe owner is linked"
      : primaryActionKind === "execute" && feePaymentToken === "native" && (!gasValid || !gasOverrides)
          ? "Set a valid network fee"
        : primaryActionKind === "execute" && feePaymentToken !== "native" && !feePaymentQuote?.quoteId
          ? "Choose a current fee-token quote"
          : null;
  const primaryAction = !displayRequestView ? undefined : primaryActionKind ? (
    <SimulationFailureConfirmButton
      disabledReason={disabledReason}
      isDisabled={!!disabledReason}
      isLoading={operation === "approve" || operation === "execute"}
      label={isRejection
        ? primaryActionKind === "execute" ? "Execute rejection" : "Sign rejection"
        : primaryActionKind === "execute" ? "Execute" : "Sign offchain"}
      onConfirm={() => void (async () => {
        const executing = primaryActionKind === "execute";
        if (executing) setSubmissionLocked(true);
        const submitted = await handleConfirm({ allowSimulationFailure: simulationReverted });
        if (executing && submitted) onExecutionSubmitted();
        else if (executing) setSubmissionLocked(false);
      })()}
      requestKind={proposal.calls.length > 1 ? "batch" : "transaction"}
      simulationFailed={shouldConfirmSimulationFailure({
        simulationReverted,
      })}
    />
  ) : executionPending ? (
    <Button
      variant="brand"
      isDisabled
    >
      Confirming onchain…
    </Button>
  ) : proposal.state === "ambiguous" ? (
    <Button
      variant="secondary"
      isLoading={busy}
      onClick={() => void runAction({
        type: "reconcileSafeProposal",
        proposalId: proposal.id,
      }, "Approval status refreshed.")}
    >
      Retry approval sync
    </Button>
  ) : (
    <Button variant="secondary" onClick={onBack}>{backLabel}</Button>
  );

  return (
    <ConfirmationScreen
      title={displayRequestView
        ? isRejection ? "Reject transaction" : "Transaction request"
        : "Transaction details"}
      onBack={onBack}
      trailing={(
        <CopyButton
          label="Copy Safe transaction JSON"
          value={JSON.stringify(proposal.calls.map((call) => ({
            to: call.to,
            value: call.value,
            data: call.data,
          })), null, 2)}
        />
      )}
      outcome={(
        <RequestIdentity
          origin={reviewRequest.origin}
          originHostname={originHostname(reviewRequest.origin)}
          favicon={reviewRequest.favicon}
          iconChipBg={iconChipBg}
          isInternalWalletChan={reviewRequest.origin === "WalletChan"}
          originInitials="SAFE"
        />
      )}
      financialImpact={displayRequestView ? (
        <SafeProposalFinancialImpact
          proposal={proposal}
          reviewRequest={reviewRequest}
          executionRequest={executionRequest}
          onRevertedChange={setSimulationReverted}
          onUnavailableChange={setSimulationUnavailable}
        />
      ) : undefined}
      financialImpactTitle={displayRequestView ? (
        <EstimatedChangesHeading chainId={proposal.chainId} chainName={chainName} />
      ) : undefined}
      context={(
        <>
          <SafeProposalRequestDetails
            proposal={proposal}
            snapshot={snapshot}
            accounts={ownerAccounts}
            error={error}
            notice={notice}
            simulationReverted={simulationReverted}
            showRequestLifecycle={displayRequestView}
          />
          <LedgerSigningStatus active={isLedgerWaiting} />
        </>
      )}
      contextTitle={displayRequestView ? "Request details" : "Safe transaction"}
      contextHeaderAction={<SafeProposalStatusPill proposal={proposal} liveNonce={snapshot.nonce} />}
      advancedDetails={(
        <SafeProposalAdvancedDetails
          proposal={proposal}
          explorer={explorer}
          busy={busy}
          readOnly={!displayRequestView}
          minimumNonce={snapshot.nonce}
          onNonceChange={handleNonceChange}
          onAction={(message, successNotice) => void runAction(message, successNotice)}
        />
      )}
      actionSummary={displayRequestView ? (
        <SafeProposalDecisionSummary
          actionKind={primaryActionKind}
          accounts={actionAccounts}
          selectedAccount={selectedAccount}
          safeOwnerAccountIds={safeOwnerAccountIds}
          executionRequest={executionRequest}
          proposalId={proposal.id}
          onSelect={(accountId) => {
            if (primaryActionKind === "execute") setExecutorAccountId(accountId);
            else setOwnerAccountId(accountId);
          }}
          onGasOverrides={setGasOverrides}
          onGasValidityChange={setGasValid}
          feePaymentToken={feePaymentToken}
          feePaymentQuote={feePaymentQuote}
          onFeePaymentTokenChange={(token) => {
            setFeePaymentToken(token);
            setFeePaymentQuote(null);
            if (token !== "native") {
              setGasOverrides(null);
              setGasValid(true);
            }
          }}
          onFeePaymentQuoteChange={setFeePaymentQuote}
          disabled={submissionLocked || isLedgerWaiting}
        />
      ) : undefined}
      actionNotice={displayRequestView ? executionBlockedReason ??
        (simulationUnavailable ? "Simulation is unavailable. Review the call details carefully." : undefined) : undefined}
      confirmAction={primaryAction}
      rejectAction={displayRequestView && canReject ? (
        <Button
          variant={requiresOnchainRejection ? "danger" : "secondary"}
          isLoading={operation === "reject"}
          isDisabled={submissionLocked || isLedgerWaiting}
          onClick={() => void handleReject()}
        >
          {requiresOnchainRejection ? "Reject onchain" : "Reject"}
        </Button>
      ) : undefined}
    />
  );
}
