import { toHex } from "viem";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { ERC5792Call } from "@/chrome/erc5792Types";
import { buildSafeExecutionData } from "@/chrome/safe/executionData";
import type {
  SafeChainSnapshot,
  SafeProposalRecord,
} from "@/chrome/safe/types";
import type { Account } from "@/chrome/types";
import {
  canStartSafeProposalRejection,
  hasSafeProposalSignatures,
} from "@/chrome/safe/proposalRejectionPolicy";
import { hasUnresolvedSafeExecution } from "@/chrome/safe/executionPolicy";
import { getSafeProposalRequestOrigin } from "./safeProposalActivityModel";

export type SafeOwnerAccount = Extract<
  Account,
  { type: "bankr" | "privateKey" | "seedPhrase" }
>;
export type SafeExecutorAccount = Extract<
  Account,
  { type: "privateKey" | "seedPhrase" }
>;
export type SafeProposalActionKind = "approve" | "execute" | null;
export type SafeProposalActionOperation =
  | Exclude<SafeProposalActionKind, null>
  | "reject"
  | "secondary"
  | null;

const APPROVABLE_STATES = new Set<SafeProposalRecord["state"]>([
  "draft",
  "approvedLocally",
  "awaitingApprovals",
]);

export function canRejectSafeProposal(proposal: SafeProposalRecord): boolean {
  return canStartSafeProposalRejection(proposal);
}

export { hasSafeProposalSignatures };

export function getSafeOwnerAccounts(
  accounts: readonly Account[],
  snapshot: SafeChainSnapshot,
): SafeOwnerAccount[] {
  return accounts.filter((account): account is SafeOwnerAccount =>
    (account.type === "bankr" ||
      account.type === "privateKey" ||
      account.type === "seedPhrase") &&
    snapshot.owners.includes(account.address.toLowerCase() as `0x${string}`),
  );
}

export function getAvailableSafeOwnerAccounts(
  accounts: readonly Account[],
  snapshot: SafeChainSnapshot,
  proposal: SafeProposalRecord,
): SafeOwnerAccount[] {
  const confirmed = new Set(
    proposal.confirmations.map((confirmation) => confirmation.ownerAddress),
  );
  return getSafeOwnerAccounts(accounts, snapshot).filter(
    (account) => !confirmed.has(account.address.toLowerCase() as `0x${string}`),
  );
}

export function getSafeExecutorAccounts(
  accounts: readonly Account[],
): SafeExecutorAccount[] {
  return accounts.filter((account): account is SafeExecutorAccount =>
    account.type === "privateKey" || account.type === "seedPhrase",
  );
}

export function getDefaultSafeExecutorAccountId(
  executors: readonly SafeExecutorAccount[],
  snapshot: SafeChainSnapshot,
): string | null {
  const owner = executors.find((account) =>
    snapshot.owners.includes(account.address.toLowerCase() as `0x${string}`),
  );
  return owner?.id ?? executors[0]?.id ?? null;
}

export function getSafeProposalActionKind(
  proposal: SafeProposalRecord,
  availableOwners: readonly SafeOwnerAccount[],
): SafeProposalActionKind {
  if (hasUnresolvedSafeExecution(proposal)) return null;
  if (proposal.state === "readyToExecute") return "execute";
  if (APPROVABLE_STATES.has(proposal.state) && availableOwners.length > 0) {
    return "approve";
  }
  return null;
}

/** Keeps the action the user pressed visible while storage advances state. */
export function getSafeProposalDisplayActionKind(
  actionKind: SafeProposalActionKind,
  operation: SafeProposalActionOperation,
): SafeProposalActionKind {
  return operation === "approve" || operation === "execute"
    ? operation
    : actionKind;
}

export function didSafeProposalExecutionConfirm(
  previous: Pick<SafeProposalRecord, "id" | "state"> | null,
  current: Pick<SafeProposalRecord, "id" | "state"> | null,
): boolean {
  return !!previous && !!current &&
    previous.id === current.id &&
    previous.state !== "executed" &&
    current.state === "executed";
}

export function makeSafeReviewTxRequest(
  proposal: SafeProposalRecord,
  chainName: string,
): PendingTxRequest {
  const first = proposal.calls[0];
  return {
    id: `safe-review:${proposal.id}`,
    tx: {
      from: proposal.safeAddress,
      to: first.to,
      value: first.value,
      data: first.data,
      chainId: proposal.chainId,
    },
    origin: getSafeProposalRequestOrigin(proposal.route.origin),
    favicon: null,
    chainName,
    timestamp: proposal.createdAt,
    trustedInternal: true,
  };
}

export function makeSafeDisplayCalls(
  proposal: SafeProposalRecord,
): ERC5792Call[] {
  return proposal.calls.map((call) => ({
    to: call.to,
    value: toHex(BigInt(call.value)),
    data: call.data,
  }));
}

export function makeSafeExecutionTxRequest(
  proposal: SafeProposalRecord,
  chainName: string,
  executor: SafeExecutorAccount,
): PendingTxRequest {
  return {
    id: `safe-execution:${proposal.id}:${executor.id}`,
    tx: {
      from: executor.address,
      to: proposal.safeAddress,
      value: "0",
      data: buildSafeExecutionData(proposal),
      chainId: proposal.chainId,
    },
    origin: "WalletChan",
    favicon: null,
    chainName,
    timestamp: proposal.createdAt,
    accountId: executor.id,
    accountAddress: executor.address,
    accountType: executor.type,
    trustedInternal: true,
  };
}
