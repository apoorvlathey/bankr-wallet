import { getBundleStatus, updateBundleStatus } from "../bundleStatusStorage";
import { BUNDLE_STATUS } from "../erc5792Types";
import { writeResultToStorage } from "../transactions/runtime";
import { notifySafeExecutionResult } from "./notifications";
import { getSafeProposals, updateSafeProposal } from "./proposalRepository";
import type { SafeProposalRecord } from "./types";

export async function terminalizeReplacedSafeRoute(
  proposal: SafeProposalRecord,
  error: string,
) {
  if (
    (proposal.route.kind === "injected" || proposal.route.kind === "walletConnect") &&
    !proposal.route.detachedAt &&
    proposal.route.requestId
  ) {
    await writeResultToStorage(`txResult:${proposal.route.requestId}`, {
      success: false,
      error,
      code: 4001,
    });
  }
  if (proposal.route.kind === "erc5792" && proposal.route.bundleId) {
    const status = await getBundleStatus(proposal.route.bundleId);
    if (status?.status === BUNDLE_STATUS.PENDING) {
      await updateBundleStatus(proposal.route.bundleId, {
        status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
        completedAt: Date.now(),
        error,
      });
    }
  }
}

export async function settleCompetingSafeProposals(
  executed: SafeProposalRecord,
): Promise<void> {
  const isRejection = executed.purpose === "rejection";
  const competitors = (await getSafeProposals()).filter((item) =>
    item.id !== executed.id &&
    item.chainId === executed.chainId &&
    item.safeAddress === executed.safeAddress &&
    item.transaction.nonce === executed.transaction.nonce &&
    !["executed", "cancelled", "replaced"].includes(item.state),
  );
  const settled = await Promise.all(competitors.map((item) =>
    updateSafeProposal(item.id, (record) => ({
      ...record,
      state: isRejection ? "cancelled" : "replaced",
      rejectedBySafeTxHash: isRejection ? executed.safeTxHash : undefined,
      error: isRejection
        ? "Rejected onchain by a same-nonce Safe transaction"
        : "Another proposal at this Safe nonce executed",
      updatedAt: Date.now(),
    })),
  ));
  await Promise.all(settled.map((item) => terminalizeReplacedSafeRoute(
    item,
    isRejection
      ? "Safe transaction rejected onchain"
      : "Another Safe transaction at this nonce executed",
  )));
  await Promise.all(settled
    .filter((item) => item.confirmations.some((confirmation) => !!confirmation.accountId))
    .map((item) => notifySafeExecutionResult({
      proposalId: item.id,
      state: isRejection ? "cancelled" : "replaced",
    })));
}
