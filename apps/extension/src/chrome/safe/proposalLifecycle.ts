import { getSafeAccountRecord } from "./accountRepository";
import { buildSafeTransaction } from "./transactionBuilder";
import {
  createSafeProposalAtNextNonce,
  getSafeProposal,
  replaceUnsignedSafeProposal,
  updateSafeProposal,
} from "./proposalRepository";
import type { SafeCall, SafeProposalRecord, SafeProposalRoute } from "./types";
import {
  futureSafeNonceError,
  isUnsignedSafeNonceEditable,
} from "./proposalNonce";
import { verifySafeOnchainState } from "./onchainState";
import { writeResultToStorage } from "../transactions/runtime";
import { getBundleStatus, saveBundleStatus } from "../batch/bundleStatusStorage";
import { BUNDLE_STATUS, type WalletConnectRequestMetadata } from "../erc5792Types";

type ProposalLifecycleDependencies = {
  verifySafeOnchainState: typeof verifySafeOnchainState;
};

const production: ProposalLifecycleDependencies = { verifySafeOnchainState };

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
}, overrides: Partial<ProposalLifecycleDependencies> = {}): Promise<SafeProposalRecord> {
  const dependencies = { ...production, ...overrides };
  const safe = await getSafeAccountRecord(input.safeAccountId);
  const snapshot = safe?.chains[String(input.chainId)];
  if (!safe || !snapshot) throw new Error("Safe is not verified on this network");
  if (snapshot.capability === "observe" || snapshot.capability === "blocked") {
    throw new Error(snapshot.blockedReason || "No linked Safe owner can approve");
  }
  const live = await dependencies.verifySafeOnchainState({
    chainId: input.chainId,
    safeAddress: safe.address,
    transactionService: snapshot.transactionService,
  });
  if (live.configEpoch !== snapshot.configEpoch || live.version !== snapshot.version) {
    throw new Error("Safe configuration changed; refresh the Safe and try again");
  }
  const now = Date.now();
  const onchainNonce = BigInt(live.nonce);
  return createSafeProposalAtNextNonce({
    safeAccountId: input.safeAccountId,
    chainId: input.chainId,
    onchainNonce,
    build: (nonce) => {
      const built = buildSafeTransaction({
        chainId: input.chainId,
        safeAddress: safe.address,
        safeVersion: live.version,
        nonce,
        calls: input.calls,
      });
      const future = nonce > onchainNonce;
      return {
        version: 1,
        id: `${input.chainId}:${safe.address}:${built.safeTxHash}`,
        chainId: input.chainId,
        safeAccountId: input.safeAccountId,
        safeAddress: safe.address,
        safeTxHash: built.safeTxHash,
        safeVersion: live.version,
        safeConfigEpoch: live.configEpoch,
        verifiedAtBlock: live.verifiedAtBlock,
        calls: built.calls,
        transaction: built.transaction,
        state: future ? "blocked" : "draft",
        confirmations: [],
        route: input.route ?? { kind: "wallet" },
        createdAt: now,
        updatedAt: now,
        error: future ? futureSafeNonceError(nonce, onchainNonce) : undefined,
      };
    },
  });
}

function parseCustomNonce(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("Invalid custom Safe nonce");
  }
  const nonce = BigInt(value);
  if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsupported Safe nonce");
  return nonce;
}

export async function changeSafeProposalNonce(input: {
  proposalId: string;
  nonce: unknown;
}, overrides: Partial<ProposalLifecycleDependencies> = {}): Promise<SafeProposalRecord> {
  const dependencies = { ...production, ...overrides };
  const proposal = await getSafeProposal(input.proposalId);
  if (!proposal) throw new Error("Safe proposal not found");
  if (!isUnsignedSafeNonceEditable(proposal)) {
    throw new Error("Safe nonce can only be changed before signing");
  }
  const safe = await getSafeAccountRecord(proposal.safeAccountId);
  const snapshot = safe?.chains[String(proposal.chainId)];
  if (!safe || !snapshot || safe.address !== proposal.safeAddress) {
    throw new Error("Safe account state is unavailable");
  }
  const nonce = parseCustomNonce(input.nonce);
  const live = await dependencies.verifySafeOnchainState({
    chainId: proposal.chainId,
    safeAddress: proposal.safeAddress,
    transactionService: snapshot.transactionService,
  });
  if (live.configEpoch !== proposal.safeConfigEpoch || live.version !== proposal.safeVersion) {
    throw new Error("Safe configuration changed; review again");
  }
  const liveNonce = BigInt(live.nonce);
  if (nonce < liveNonce) {
    throw new Error(`Safe nonce must be ${liveNonce} or higher`);
  }
  if (nonce === BigInt(proposal.transaction.nonce)) return proposal;
  const built = buildSafeTransaction({
    chainId: proposal.chainId,
    safeAddress: proposal.safeAddress,
    safeVersion: proposal.safeVersion,
    nonce,
    calls: proposal.calls,
  });
  const future = nonce > liveNonce;
  return replaceUnsignedSafeProposal(proposal.id, {
    ...proposal,
    id: `${proposal.chainId}:${proposal.safeAddress}:${built.safeTxHash}`,
    safeTxHash: built.safeTxHash,
    verifiedAtBlock: live.verifiedAtBlock,
    calls: built.calls,
    transaction: built.transaction,
    state: future ? "blocked" : "draft",
    confirmations: [],
    unsupportedConfirmations: undefined,
    effectClaim: undefined,
    error: future ? futureSafeNonceError(nonce, liveNonce) : undefined,
    updatedAt: Date.now(),
  });
}

export async function cancelSafeProposal(id: string): Promise<SafeProposalRecord> {
  const proposal = await getSafeProposal(id);
  if (!proposal) throw new Error("Safe proposal not found");
  if (proposal.confirmations.length > 0 || (proposal.unsupportedConfirmations?.length ?? 0) > 0) {
    throw new Error("Signed Safe proposals require an onchain rejection transaction");
  }
  if (!["draft", "approvedLocally", "awaitingApprovals", "readyToExecute", "blocked"].includes(proposal.state)) {
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
