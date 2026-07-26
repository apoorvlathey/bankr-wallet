import { getSafeAccountRecord } from "./accountRepository";
import {
  claimSafeProposalEffect,
  getSafeProposal,
  releaseSafeProposalEffect,
  updateSafeProposal,
} from "./proposalRepository";
import {
  fetchSafeServiceTransaction,
  publishSafeConfirmation,
  publishSafeProposal,
  SafeServiceError,
} from "./serviceClient";
import { validateServiceTransaction } from "./serviceValidation";
import type { SafeOwnerConfirmation, SafeProposalRecord } from "./types";
import { mergeSafeServiceProposal } from "./serviceMerge";

export function mergePublishedSafeConfirmations(
  local: readonly SafeOwnerConfirmation[],
  published: readonly SafeOwnerConfirmation[],
) {
  const byOwner = new Map(published.map((item) => [item.ownerAddress, item]));
  for (const item of local) {
    const publishedItem = byOwner.get(item.ownerAddress);
    byOwner.set(item.ownerAddress, publishedItem
      ? { ...item, publishedAt: publishedItem.publishedAt }
      : item);
  }
  return [...byOwner.values()];
}

export async function reconcileSafeProposal(id: string): Promise<SafeProposalRecord> {
  const proposal = await getSafeProposal(id);
  if (!proposal) throw new Error("Safe proposal not found");
  const safe = await getSafeAccountRecord(proposal.safeAccountId);
  const snapshot = safe?.chains[String(proposal.chainId)];
  if (!safe || !snapshot) throw new Error("Safe account state is unavailable");
  const remote = await validateServiceTransaction({
    value: await fetchSafeServiceTransaction(proposal.chainId, proposal.safeTxHash),
    safeAccountId: proposal.safeAccountId,
    snapshot,
    safeAddress: proposal.safeAddress,
  });
  return updateSafeProposal(id, (current) =>
    mergeSafeServiceProposal(current, remote));
}

export async function publishSafeProposalConfirmations(id: string): Promise<SafeProposalRecord> {
  const proposal = await getSafeProposal(id);
  if (!proposal) throw new Error("Safe proposal not found");
  const unpublished = proposal.confirmations.filter((item) => !item.publishedAt);
  if (unpublished.length === 0) return proposal;
  const claimed = await claimSafeProposalEffect(id, { kind: "publish" });
  const claimId = claimed.effectClaim!.claimId;
  await updateSafeProposal(id, (record) => ({ ...record, state: "publishing", updatedAt: Date.now() }));
  try {
    const alreadyPublished = proposal.confirmations.some((item) => item.publishedAt);
    for (let index = 0; index < unpublished.length; index++) {
      const confirmation = unpublished[index];
      if (!alreadyPublished && index === 0) {
        await publishSafeProposal(proposal, confirmation);
      } else {
        await publishSafeConfirmation(proposal, confirmation);
      }
    }
    const publishedAt = Date.now();
    const publishedConfirmations = proposal.confirmations.map((item) =>
      item.publishedAt ? item : { ...item, publishedAt },
    );
    const safe = await getSafeAccountRecord(proposal.safeAccountId);
    const threshold = safe?.chains[String(proposal.chainId)]?.threshold;
    return releaseSafeProposalEffect(id, claimId, (current) => {
      const confirmations = mergePublishedSafeConfirmations(
        current.confirmations,
        publishedConfirmations,
      );
      return {
        confirmations,
        state: threshold && confirmations.length >= threshold
          ? "readyToExecute"
          : "awaitingApprovals",
        error: undefined,
      };
    });
  } catch (error) {
    await releaseSafeProposalEffect(id, claimId, {
      state: "ambiguous",
      error: "Publication outcome is unknown; reconcile before retrying",
    }).catch(() => {});
    throw error;
  }
}

export async function retryAmbiguousSafePublication(id: string): Promise<SafeProposalRecord> {
  const proposal = await getSafeProposal(id);
  if (!proposal || proposal.state !== "ambiguous" || proposal.transactionHash) {
    throw new Error("Safe publication is not awaiting reconciliation");
  }
  try {
    const reconciled = await reconcileSafeProposal(id);
    if (reconciled.confirmations.some((item) => !item.publishedAt)) {
      return publishSafeProposalConfirmations(id);
    }
    return reconciled;
  } catch (error) {
    if (!(error instanceof SafeServiceError) || error.status !== 404 || Date.now() - proposal.updatedAt < 15_000) {
      throw error;
    }
    await updateSafeProposal(id, (current) => ({
      ...current,
      state: "approvedLocally",
      effectClaim: undefined,
      error: undefined,
      updatedAt: Date.now(),
    }));
    return publishSafeProposalConfirmations(id);
  }
}
