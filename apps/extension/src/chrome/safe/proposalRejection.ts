import { getSafeAccountRecord } from "./accountRepository";
import { verifySafeOnchainState } from "./onchainState";
import { cancelSafeProposal } from "./proposalLifecycle";
import {
  createSafeProposal,
  getSafeProposal,
  updateSafeProposal,
} from "./proposalRepository";
import { buildSafeRejectionTransaction } from "./transactionBuilder";
import type { SafeProposalRecord } from "./types";
import {
  canStartSafeProposalRejection,
  hasSafeProposalSignatures,
  isCanonicalSafeRejection,
} from "./proposalRejectionPolicy";

export type SafeProposalRejectionResult =
  | { kind: "cancelledLocally"; proposal: SafeProposalRecord }
  | { kind: "onchain"; proposal: SafeProposalRecord };

/**
 * Rejects unsigned work locally, but never represents a signed Safe proposal
 * as cancelled. Once any signature exists, this creates (or reuses) the
 * canonical same-nonce onchain rejection proposal.
 */
export async function startSafeProposalRejection(
  proposalId: string,
): Promise<SafeProposalRejectionResult> {
  const proposal = await getSafeProposal(proposalId);
  if (!proposal) throw new Error("Safe proposal not found");
  if (!canStartSafeProposalRejection(proposal)) {
    throw new Error("Safe proposal cannot be rejected in its current state");
  }
  if (!hasSafeProposalSignatures(proposal)) {
    return { kind: "cancelledLocally", proposal: await cancelSafeProposal(proposal.id) };
  }

  const safe = await getSafeAccountRecord(proposal.safeAccountId);
  const stored = safe?.chains[String(proposal.chainId)];
  if (!safe || safe.address !== proposal.safeAddress || !stored) {
    throw new Error("Safe account state is unavailable");
  }
  const live = await verifySafeOnchainState({
    chainId: proposal.chainId,
    safeAddress: proposal.safeAddress,
  });
  if (live.configEpoch !== proposal.safeConfigEpoch) {
    throw new Error("Safe configuration changed; review again");
  }
  if (BigInt(live.nonce) !== BigInt(proposal.transaction.nonce)) {
    throw new Error("Safe proposal nonce is not executable");
  }

  const built = buildSafeRejectionTransaction({
    chainId: proposal.chainId,
    safeAddress: proposal.safeAddress,
    safeVersion: live.version,
    nonce: BigInt(proposal.transaction.nonce),
  });
  const id = `${proposal.chainId}:${proposal.safeAddress}:${built.safeTxHash}`;
  const existing = await getSafeProposal(id);
  if (existing) {
    if (!isCanonicalSafeRejection(existing)) {
      throw new Error("Same-nonce Safe proposal is not a canonical rejection");
    }
    const marked = existing.purpose === "rejection"
      ? existing
      : await updateSafeProposal(existing.id, (record) => ({
          ...record,
          purpose: "rejection",
          updatedAt: Date.now(),
        }));
    return { kind: "onchain", proposal: marked };
  }

  const now = Date.now();
  const rejection = await createSafeProposal({
    version: 1,
    id,
    chainId: proposal.chainId,
    safeAccountId: proposal.safeAccountId,
    safeAddress: proposal.safeAddress,
    safeTxHash: built.safeTxHash,
    safeVersion: live.version,
    safeConfigEpoch: live.configEpoch,
    verifiedAtBlock: live.verifiedAtBlock,
    calls: built.calls,
    transaction: built.transaction,
    state: "draft",
    confirmations: [],
    route: { kind: "wallet", origin: "WalletChan" },
    purpose: "rejection",
    createdAt: now,
    updatedAt: now,
  });
  return { kind: "onchain", proposal: rejection };
}
