import { Button } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { isPendingSafeProposal } from "@/chrome/safe/proposalStatus";
import type { SafeChainSnapshot, SafeProposalRecord } from "@/chrome/safe/types";
import type { Account, SafeAccount } from "@/chrome/types";
import type { GasOverrides } from "@/chrome/txHandlers";
import { CopyButton } from "@/components/CopyButton";
import { EstimatedChangesHeading } from "@/components/RequestConfirmation/EstimatedChangesHeading";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";
import { SimulationFailureConfirmButton } from "@/components/RequestConfirmation/SimulationFailureConfirmButton";
import { ConfirmationScreen } from "@/components/ui";
import { useIconChipBg } from "@/theme";
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
}) {
  const iconChipBg = useIconChipBg();
  const [ownerAccountId, setOwnerAccountId] = useState<string | null>(null);
  const [executorAccountId, setExecutorAccountId] = useState<string | null>(null);
  const [gasOverrides, setGasOverrides] = useState<GasOverrides | null>(null);
  const [gasValid, setGasValid] = useState(false);
  const [simulationReverted, setSimulationReverted] = useState(false);
  const [simulationUnavailable, setSimulationUnavailable] = useState(false);
  const [reviewFresh, setReviewFresh] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const ownerAccounts = useMemo(
    () => getSafeOwnerAccounts(accounts, snapshot),
    [accounts, snapshot],
  );
  const safeOwnerAccountIds = useMemo(
    () => new Set(ownerAccounts.map((account) => account.id)),
    [ownerAccounts],
  );
  const availableOwners = useMemo(
    () => getAvailableSafeOwnerAccounts(accounts, snapshot, proposal),
    [accounts, proposal, snapshot],
  );
  const executors = useMemo(() => getSafeExecutorAccounts(accounts), [accounts]);
  const actionKind = getSafeProposalActionKind(proposal, availableOwners);
  const isRequestView = isPendingSafeProposal(proposal);
  const isRejection = proposal.purpose === "rejection";
  const requiresOnchainRejection = hasSafeProposalSignatures(proposal);
  const executionPending = ["ambiguous", "executing"].includes(proposal.state) && !!proposal.transactionHash;
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
    setGasOverrides(null);
    setGasValid(actionKind !== "execute");
  }, [actionKind, executorAccountId, proposal.id]);

  useEffect(() => {
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
  }, [isRequestView, proposal.id]);

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
    onBack,
    onOpenProposal,
    onReload,
  });
  const error = actionError ?? reviewError;
  const selectedAccount = primaryActionKind === "execute"
    ? selectedExecutor
    : operation === "approve"
      ? ownerAccounts.find((account) => account.id === ownerAccountId) ?? null
      : selectedOwner;
  const actionAccounts = primaryActionKind === "execute"
    ? executors
    : operation === "approve"
      ? ownerAccounts
      : availableOwners;
  const executionRequest = useMemo<PendingTxRequest | null>(
    () => primaryActionKind === "execute" && selectedExecutor
      ? makeSafeExecutionTxRequest(proposal, chainName, selectedExecutor)
      : null,
    [chainName, primaryActionKind, proposal, selectedExecutor],
  );

  const canReject = canRejectSafeProposal(proposal);
  const disabledReason = !reviewFresh
    ? "Refreshing Safe authority"
    : !selectedAccount
        ? primaryActionKind === "execute" ? "No local execution account is available" : "No available Safe owner is linked"
      : simulationReverted
        ? "The reviewed Safe transaction reverted during simulation"
        : primaryActionKind === "execute" && (!gasValid || !gasOverrides)
          ? "Set a valid network fee"
          : null;
  const primaryAction = !isRequestView ? undefined : primaryActionKind ? (
    <SimulationFailureConfirmButton
      disabledReason={disabledReason}
      isDisabled={!!disabledReason}
      isLoading={operation === "approve" || operation === "execute"}
      label={isRejection
        ? primaryActionKind === "execute" ? "Execute rejection" : "Sign rejection"
        : primaryActionKind === "execute" ? "Execute" : "Sign offchain"}
      onConfirm={() => void handleConfirm()}
      requestKind={proposal.calls.length > 1 ? "batch" : "transaction"}
      simulationFailed={false}
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
      title={isRequestView
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
      financialImpact={isRequestView ? (
        <SafeProposalFinancialImpact
          proposal={proposal}
          reviewRequest={reviewRequest}
          onRevertedChange={setSimulationReverted}
          onUnavailableChange={setSimulationUnavailable}
        />
      ) : undefined}
      financialImpactTitle={isRequestView ? (
        <EstimatedChangesHeading chainId={proposal.chainId} chainName={chainName} />
      ) : undefined}
      context={(
        <SafeProposalRequestDetails
          proposal={proposal}
          snapshot={snapshot}
          accounts={ownerAccounts}
          error={error}
          notice={notice}
          simulationReverted={simulationReverted}
          showRequestLifecycle={isRequestView}
        />
      )}
      contextTitle={isRequestView ? "Request details" : "Safe transaction"}
      contextHeaderAction={<SafeProposalStatusPill proposal={proposal} />}
      advancedDetails={(
        <SafeProposalAdvancedDetails
          proposal={proposal}
          explorer={explorer}
          busy={busy}
          readOnly={!isRequestView}
          onAction={(message, successNotice) => void runAction(message, successNotice)}
        />
      )}
      actionSummary={isRequestView ? (
        <SafeProposalDecisionSummary
          actionKind={primaryActionKind}
          accounts={actionAccounts}
          selectedAccount={selectedAccount}
          safeOwnerAccountIds={safeOwnerAccountIds}
          executionRequest={executionRequest}
          onSelect={(accountId) => {
            if (primaryActionKind === "execute") setExecutorAccountId(accountId);
            else setOwnerAccountId(accountId);
          }}
          onGasOverrides={setGasOverrides}
          onGasValidityChange={setGasValid}
        />
      ) : undefined}
      actionNotice={isRequestView && simulationUnavailable
        ? "Simulation is unavailable. Review the call details carefully."
        : undefined}
      confirmAction={primaryAction}
      rejectAction={isRequestView && canReject ? (
        <Button
          variant={requiresOnchainRejection ? "danger" : "secondary"}
          isLoading={operation === "reject"}
          onClick={() => void handleReject()}
        >
          {requiresOnchainRejection ? "Reject onchain" : "Reject"}
        </Button>
      ) : undefined}
    />
  );
}
