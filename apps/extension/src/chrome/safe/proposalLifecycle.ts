import { getSafeAccountRecord } from "./accountRepository";
import { buildSafeTransaction } from "./transactionBuilder";
import { createSafeProposal, getSafeProposal, updateSafeProposal } from "./proposalRepository";
import type { SafeCall, SafeProposalRecord, SafeProposalRoute } from "./types";
import { writeResultToStorage } from "../transactions/runtime";
import { getBundleStatus, saveBundleStatus } from "../batch/bundleStatusStorage";
import { BUNDLE_STATUS, type WalletConnectRequestMetadata } from "../erc5792Types";

function routeWalletConnect(route: SafeProposalRoute): WalletConnectRequestMetadata | undefined {
  const requestId = Number(route.requestId);
  return route.topic && Number.isSafeInteger(requestId)
    ? { topic: route.topic, requestId, method: "wallet_sendCalls" }
    : undefined;
}

/** Publishes the ERC-5792 bundle identity only after explicit owner approval. */
export async function authorizeSafeProposalRoute(proposal: SafeProposalRecord): Promise<void> {
  const { route } = proposal;
  if (route.kind !== "erc5792" || !route.bundleId || route.detachedAt) return;
  if (!(await getBundleStatus(route.bundleId))) {
    await saveBundleStatus({
      id: route.bundleId,
      chainId: proposal.chainId,
      status: BUNDLE_STATUS.PENDING,
      atomic: true,
      createdAt: Date.now(),
      origin: route.origin,
      walletConnect: routeWalletConnect(route),
    });
  }
  await writeResultToStorage(`batchTxAck:${route.bundleId}`, {
    success: true,
    id: route.bundleId,
  });
}

async function rejectUnacknowledgedSafeRoute(proposal: SafeProposalRecord, error: string) {
  if (proposal.route.kind !== "erc5792" || !proposal.route.bundleId || await getBundleStatus(proposal.route.bundleId)) return;
  await writeResultToStorage(`batchTxAck:${proposal.route.bundleId}`, { success: false, error, code: 4001 });
}

async function rejectPendingSafeRoute(proposal: SafeProposalRecord, error: string) {
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
  await rejectUnacknowledgedSafeRoute(proposal, error);
}

export async function createReviewedSafeProposal(input: {
  safeAccountId: string;
  chainId: number;
  calls: SafeCall[];
  route?: SafeProposalRoute;
}): Promise<SafeProposalRecord> {
  const safe = await getSafeAccountRecord(input.safeAccountId);
  const snapshot = safe?.chains[String(input.chainId)];
  if (!safe || !snapshot) throw new Error("Safe is not verified on this network");
  if (snapshot.capability === "observe" || snapshot.capability === "blocked") {
    throw new Error(snapshot.blockedReason || "No linked Safe owner can approve");
  }
  const built = buildSafeTransaction({
    chainId: input.chainId,
    safeAddress: safe.address,
    safeVersion: snapshot.version,
    nonce: BigInt(snapshot.nonce),
    calls: input.calls,
  });
  const now = Date.now();
  const id = `${input.chainId}:${safe.address}:${built.safeTxHash}`;
  return createSafeProposal({
    version: 1,
    id,
    chainId: input.chainId,
    safeAccountId: input.safeAccountId,
    safeAddress: safe.address,
    safeTxHash: built.safeTxHash,
    safeVersion: snapshot.version,
    safeConfigEpoch: snapshot.configEpoch,
    verifiedAtBlock: snapshot.verifiedAtBlock,
    calls: built.calls,
    transaction: built.transaction,
    state: "draft",
    confirmations: [],
    route: input.route ?? { kind: "wallet" },
    createdAt: now,
    updatedAt: now,
  });
}

export async function cancelSafeProposal(id: string): Promise<SafeProposalRecord> {
  const proposal = await getSafeProposal(id);
  if (!proposal) throw new Error("Safe proposal not found");
  if (proposal.confirmations.length > 0 || (proposal.unsupportedConfirmations?.length ?? 0) > 0) {
    throw new Error("Signed Safe proposals require an onchain rejection transaction");
  }
  if (!["draft", "approvedLocally", "awaitingApprovals", "readyToExecute"].includes(proposal.state)) {
    throw new Error("Safe proposal cannot be cancelled in its current state");
  }
  const updated = await updateSafeProposal(id, (record) => ({
    ...record,
    state: "cancelled",
    effectClaim: undefined,
    updatedAt: Date.now(),
  }));
  await rejectPendingSafeRoute(updated, "Safe proposal request rejected");
  return updated;
}

export async function hideSafeProposal(id: string): Promise<SafeProposalRecord> {
  return updateSafeProposal(id, (record) => ({
    ...(() => {
      if (record.hiddenAt) throw new Error("Safe proposal is already hidden");
      if (!["cancelled", "executed", "failed", "replaced"].includes(record.state)) {
        throw new Error("Pending Safe proposals cannot be hidden");
      }
      return record;
    })(),
    hiddenAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

export async function detachSafeProposalRoute(id: string): Promise<SafeProposalRecord> {
  const updated = await updateSafeProposal(id, (record) => ({
    ...(() => {
      if (record.route.detachedAt) throw new Error("Safe proposal is already detached");
      return record;
    })(),
    route: { ...record.route, detachedAt: Date.now() },
    updatedAt: Date.now(),
  }));
  if ((updated.route.kind === "injected" || updated.route.kind === "walletConnect") && updated.route.requestId) {
    await writeResultToStorage(`txResult:${updated.route.requestId}`, {
      success: false,
      error: "Safe proposal detached from dapp; approvals remain in WalletChan",
      code: 4001,
    });
  }
  await rejectUnacknowledgedSafeRoute(updated, "Safe proposal detached from app");
  return updated;
}
