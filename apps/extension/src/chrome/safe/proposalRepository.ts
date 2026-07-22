import { getAddress } from "viem";
import { withStorageLock } from "../storageLock";
import { computeSafeTransactionHash } from "./transactionHash";
import { hasUnresolvedSafeExecution } from "./executionPolicy";
import { getNextAvailableSafeNonce, isUnsignedSafeNonceEditable } from "./proposalNonce";
import {
  assertSafeProposalEffectClaimable,
  isLocallyCancelledUnsignedSafeProposal,
  recoverInterruptedSafeProposalRecords,
} from "./proposalRecovery";
import type {
  SafeAddress,
  SafeCall,
  SafeOwnerConfirmation,
  SafeExecutionExecutor,
  SafeProposalRecord,
  SafeProposalState,
  SafeUnsupportedConfirmation,
  SafeTransactionData,
} from "./types";

export const SAFE_PROPOSALS_STORAGE_KEY = "safeProposals";
const SAFE_PROPOSAL_LOCK = "walletchan:safe-proposals";
const MAX_PROPOSALS = 500;
const MAX_CALLS = 100;
const MAX_CONFIRMATIONS = 100;
const MAX_CALLDATA_BYTES = 128 * 1024;
const MAX_SERIALIZED_EXECUTION_BYTES = 512 * 1024;
const MAX_STORAGE_BYTES = 4 * 1024 * 1024;

interface Envelope { version: 1; records: SafeProposalRecord[] }
const STATES = new Set<SafeProposalState>([
  "draft", "authorizing", "approvedLocally", "publishing",
  "awaitingApprovals", "readyToExecute", "executing", "executed",
  "cancelled", "ambiguous", "stale", "replaced", "blocked", "failed",
]);
const ACCOUNT_TYPES = new Set(["bankr", "privateKey", "seedPhrase"]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Safe proposal record");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 512): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) throw new Error(`Invalid Safe ${label}`);
  return value;
}
function address(value: unknown, label: string): SafeAddress {
  if (typeof value !== "string") throw new Error(`Invalid Safe ${label}`);
  try { return getAddress(value).toLowerCase() as SafeAddress; } catch { throw new Error(`Invalid Safe ${label}`); }
}
function hex(value: unknown, label: string, bytes?: number): `0x${string}` {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) throw new Error(`Invalid Safe ${label}`);
  if (bytes !== undefined && value.length !== 2 + bytes * 2) throw new Error(`Invalid Safe ${label}`);
  return value.toLowerCase() as `0x${string}`;
}
function decimal(value: unknown, label: string): `${bigint}` {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`Invalid Safe ${label}`);
  return value as `${bigint}`;
}
function integer(value: unknown, label: string, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) throw new Error(`Invalid Safe ${label}`);
  return value as number;
}
function call(value: unknown): SafeCall {
  const raw = object(value);
  const operation = integer(raw.operation, "call operation") as 0 | 1;
  if (operation !== 0) throw new Error("Safe inner delegatecall is unsupported");
  const data = hex(raw.data, "call data");
  if ((data.length - 2) / 2 > MAX_CALLDATA_BYTES) throw new Error("Safe calldata is too large");
  return { to: address(raw.to, "call target"), value: decimal(raw.value, "call value"), data, operation };
}
function transaction(value: unknown): SafeTransactionData {
  const raw = object(value);
  const operation = integer(raw.operation, "operation") as 0 | 1;
  if (operation !== 0 && operation !== 1) throw new Error("Invalid Safe operation");
  return {
    to: address(raw.to, "transaction target"),
    value: decimal(raw.value, "transaction value"),
    data: hex(raw.data, "transaction data"),
    operation,
    safeTxGas: decimal(raw.safeTxGas, "safeTxGas"),
    baseGas: decimal(raw.baseGas, "baseGas"),
    gasPrice: decimal(raw.gasPrice, "gasPrice"),
    gasToken: address(raw.gasToken, "gas token"),
    refundReceiver: address(raw.refundReceiver, "refund receiver"),
    nonce: integer(raw.nonce, "nonce"),
  };
}
function confirmation(value: unknown): SafeOwnerConfirmation {
  const raw = object(value);
  const hasLocalBinding = raw.accountId !== undefined || raw.accountType !== undefined;
  if (hasLocalBinding && (typeof raw.accountId !== "string" || !ACCOUNT_TYPES.has(raw.accountType as string))) throw new Error("Invalid Safe confirmation account binding");
  const createdAt = integer(raw.createdAt, "confirmation time", 1);
  return {
    ownerAddress: address(raw.ownerAddress, "confirmation owner"),
    accountId: hasLocalBinding ? text(raw.accountId, "confirmation account ID") : undefined,
    accountType: hasLocalBinding ? raw.accountType as SafeOwnerConfirmation["accountType"] : undefined,
    signature: hex(raw.signature, "confirmation signature", 65),
    createdAt,
    publishedAt: raw.publishedAt === undefined ? undefined : integer(raw.publishedAt, "publication time", 1),
  };
}
function unsupportedConfirmation(value: unknown): SafeUnsupportedConfirmation {
  const raw = object(value);
  if (!["contract", "approvedHash", "unknown"].includes(raw.signatureType as string)) {
    throw new Error("Invalid unsupported Safe confirmation type");
  }
  return {
    ownerAddress: address(raw.ownerAddress, "unsupported confirmation owner"),
    signatureType: raw.signatureType as SafeUnsupportedConfirmation["signatureType"],
    createdAt: integer(raw.createdAt, "unsupported confirmation time", 1),
  };
}

function executor(value: unknown): SafeExecutionExecutor {
  const raw = object(value);
  if (raw.accountType !== "privateKey" && raw.accountType !== "seedPhrase") {
    throw new Error("Invalid Safe execution account type");
  }
  const gasRaw = raw.gasOverrides === undefined
    ? undefined
    : object(raw.gasOverrides);
  return {
    accountId: text(raw.accountId, "execution account ID"),
    accountType: raw.accountType,
    address: address(raw.address, "execution account address"),
    preparedAt: integer(raw.preparedAt, "execution account preparation time", 1),
    feePaymentToken: raw.feePaymentToken === undefined
      ? undefined
      : text(raw.feePaymentToken, "execution fee token", 32),
    feePaymentTokenAddress: raw.feePaymentTokenAddress === undefined
      ? undefined
      : address(raw.feePaymentTokenAddress, "execution fee token address"),
    gasOverrides: gasRaw
      ? {
          gasLimit: decimal(gasRaw.gasLimit, "execution gas limit"),
          maxFeePerGas: decimal(gasRaw.maxFeePerGas, "execution max fee"),
          maxPriorityFeePerGas: decimal(
            gasRaw.maxPriorityFeePerGas,
            "execution priority fee",
          ),
        }
      : undefined,
  };
}

export function decodeSafeProposal(value: unknown): SafeProposalRecord {
  const raw = object(value);
  if (raw.version !== 1 || !STATES.has(raw.state as SafeProposalState)) throw new Error("Invalid Safe proposal version or state");
  if (!Array.isArray(raw.calls) || raw.calls.length < 1 || raw.calls.length > MAX_CALLS) throw new Error("Invalid Safe proposal calls");
  if (!Array.isArray(raw.confirmations) || raw.confirmations.length > MAX_CONFIRMATIONS) throw new Error("Invalid Safe confirmations");
  const calls = raw.calls.map(call);
  if (calls.reduce((sum, item) => sum + (item.data.length - 2) / 2, 0) > MAX_CALLDATA_BYTES) throw new Error("Safe calldata is too large");
  const confirmations = raw.confirmations.map(confirmation);
  const unsupportedConfirmations = raw.unsupportedConfirmations === undefined
    ? []
    : Array.isArray(raw.unsupportedConfirmations) && raw.unsupportedConfirmations.length <= MAX_CONFIRMATIONS
      ? raw.unsupportedConfirmations.map(unsupportedConfirmation)
      : (() => { throw new Error("Invalid unsupported Safe confirmations"); })();
  if (new Set(confirmations.map((item) => item.ownerAddress)).size !== confirmations.length) throw new Error("Duplicate Safe owner confirmation");
  if (new Set(unsupportedConfirmations.map((item) => item.ownerAddress)).size !== unsupportedConfirmations.length) throw new Error("Duplicate unsupported Safe owner confirmation");
  if (unsupportedConfirmations.some((item) => confirmations.some((confirmation) => confirmation.ownerAddress === item.ownerAddress))) throw new Error("Safe owner has conflicting confirmation types");
  const routeRaw = object(raw.route);
  if (!["wallet", "injected", "walletConnect", "erc5792"].includes(routeRaw.kind as string)) throw new Error("Invalid Safe proposal route");
  const serializedExecution = raw.serializedExecution === undefined
    ? undefined
    : hex(raw.serializedExecution, "serialized execution");
  if (serializedExecution && (serializedExecution.length - 2) / 2 > MAX_SERIALIZED_EXECUTION_BYTES) {
    throw new Error("Serialized Safe execution is too large");
  }
  const record: SafeProposalRecord = {
    version: 1,
    id: text(raw.id, "proposal ID"),
    chainId: integer(raw.chainId, "chain ID", 1),
    safeAccountId: text(raw.safeAccountId, "account ID"),
    safeAddress: address(raw.safeAddress, "address"),
    safeTxHash: hex(raw.safeTxHash, "transaction hash", 32),
    safeVersion: raw.safeVersion as SafeProposalRecord["safeVersion"],
    safeConfigEpoch: hex(raw.safeConfigEpoch, "configuration epoch", 32),
    verifiedAtBlock: decimal(raw.verifiedAtBlock, "verified block"),
    calls,
    transaction: transaction(raw.transaction),
    state: raw.state as SafeProposalState,
    confirmations,
    unsupportedConfirmations: unsupportedConfirmations.length ? unsupportedConfirmations : undefined,
    route: {
      kind: routeRaw.kind as SafeProposalRecord["route"]["kind"],
      origin: typeof routeRaw.origin === "string" ? routeRaw.origin.slice(0, 2048) : undefined,
      tabId: routeRaw.tabId === undefined ? undefined : integer(routeRaw.tabId, "route tab ID"),
      frameId: routeRaw.frameId === undefined ? undefined : integer(routeRaw.frameId, "route frame ID"),
      topic: typeof routeRaw.topic === "string" ? routeRaw.topic.slice(0, 512) : undefined,
      requestId: typeof routeRaw.requestId === "string" ? routeRaw.requestId.slice(0, 512) : undefined,
      bundleId: typeof routeRaw.bundleId === "string" ? routeRaw.bundleId.slice(0, 512) : undefined,
      detachedAt: routeRaw.detachedAt === undefined ? undefined : integer(routeRaw.detachedAt, "route detach time", 1),
    },
    purpose: raw.purpose === undefined
      ? undefined
      : raw.purpose === "rejection"
        ? "rejection"
        : (() => { throw new Error("Invalid Safe proposal purpose"); })(),
    createdAt: integer(raw.createdAt, "creation time", 1),
    updatedAt: integer(raw.updatedAt, "update time", 1),
    hiddenAt: raw.hiddenAt === undefined ? undefined : integer(raw.hiddenAt, "hidden time", 1),
    rejectedBySafeTxHash: raw.rejectedBySafeTxHash === undefined
      ? undefined
      : hex(raw.rejectedBySafeTxHash, "rejection transaction hash", 32),
    transactionHash: raw.transactionHash === undefined ? undefined : hex(raw.transactionHash, "execution hash", 32),
    userOperationHash: raw.userOperationHash === undefined
      ? undefined
      : hex(raw.userOperationHash, "execution UserOperation hash", 32),
    serializedExecution,
    executionPreparedAt: raw.executionPreparedAt === undefined
      ? undefined
      : integer(raw.executionPreparedAt, "execution preparation time", 1),
    executor: raw.executor === undefined ? undefined : executor(raw.executor),
    error: typeof raw.error === "string" ? raw.error.slice(0, 1000) : undefined,
    effectClaim: raw.effectClaim === undefined ? undefined : (() => {
      const claim = object(raw.effectClaim);
      if (!["approve", "publish", "execute"].includes(claim.kind as string)) throw new Error("Invalid Safe effect claim");
      return {
        kind: claim.kind as "approve" | "publish" | "execute",
        claimId: text(claim.claimId, "claim ID"),
        ownerAddress: claim.ownerAddress === undefined ? undefined : address(claim.ownerAddress, "claim owner"),
        claimedAt: integer(claim.claimedAt, "claim time", 1),
      };
    })(),
  };
  if (!["1.3.0", "1.4.1", "1.5.0"].includes(record.safeVersion)) throw new Error("Unsupported Safe proposal version");
  const recomputed = computeSafeTransactionHash({ chainId: record.chainId, safeAddress: record.safeAddress, safeVersion: record.safeVersion, transaction: record.transaction });
  if (recomputed !== record.safeTxHash) throw new Error("Safe proposal hash mismatch");
  const identity = `${record.chainId}:${record.safeAddress}:${record.safeTxHash}`;
  if (record.id !== identity) throw new Error("Safe proposal identity mismatch");
  if (record.purpose === "rejection" && !(
    record.calls.length === 1 &&
    record.calls[0]?.to === record.safeAddress &&
    record.calls[0]?.value === "0" &&
    record.calls[0]?.data === "0x" &&
    record.calls[0]?.operation === 0 &&
    record.transaction.to === record.safeAddress &&
    record.transaction.value === "0" &&
    record.transaction.data === "0x" &&
    record.transaction.operation === 0
  )) {
    throw new Error("Invalid Safe rejection transaction");
  }
  if (record.rejectedBySafeTxHash === record.safeTxHash) {
    throw new Error("Safe proposal cannot reject itself");
  }
  return record;
}

export function decodeSafeProposalsEnvelope(value: unknown): Envelope {
  if (value === undefined) return { version: 1, records: [] };
  const raw = object(value);
  if (raw.version !== 1 || !Array.isArray(raw.records) || raw.records.length > MAX_PROPOSALS) throw new Error("Invalid Safe proposal storage");
  const records = raw.records.map(decodeSafeProposal);
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error("Duplicate Safe proposal");
  return { version: 1, records };
}

async function mutate<T>(operation: (records: SafeProposalRecord[]) => { records: SafeProposalRecord[]; result: T }): Promise<T> {
  return withStorageLock(SAFE_PROPOSAL_LOCK, async () => {
    const stored = await chrome.storage.local.get(SAFE_PROPOSALS_STORAGE_KEY);
    const current = decodeSafeProposalsEnvelope(stored[SAFE_PROPOSALS_STORAGE_KEY]);
    const next = operation(current.records);
    const envelope: Envelope = { version: 1, records: next.records.map(decodeSafeProposal) };
    if (JSON.stringify(envelope).length > MAX_STORAGE_BYTES) throw new Error("Safe proposal storage limit reached");
    await chrome.storage.local.set({ [SAFE_PROPOSALS_STORAGE_KEY]: envelope });
    chrome.runtime?.sendMessage?.({ type: "safeProposalsUpdated" }).catch?.(() => undefined);
    void import("../requests/pendingTxStorage").then(({ updateBadge }) => updateBadge()).catch(() => undefined);
    return next.result;
  });
}

export async function getSafeProposals(): Promise<SafeProposalRecord[]> {
  const stored = await chrome.storage.local.get(SAFE_PROPOSALS_STORAGE_KEY);
  return decodeSafeProposalsEnvelope(stored[SAFE_PROPOSALS_STORAGE_KEY]).records;
}
export async function getSafeProposal(id: string) {
  return (await getSafeProposals()).find((record) => record.id === id) ?? null;
}
export async function createSafeProposal(record: SafeProposalRecord) {
  const decoded = decodeSafeProposal(record);
  return mutate((records) => {
    const existing = records.find((item) => item.id === decoded.id);
    if (existing) return { records, result: existing };
    if (records.length >= MAX_PROPOSALS) throw new Error("Too many Safe proposals");
    return { records: [...records, decoded], result: decoded };
  });
}

/** Allocates and persists one proposal under the proposal-storage lock. */
export async function createSafeProposalAtNextNonce(input: {
  safeAccountId: string;
  chainId: number;
  onchainNonce: bigint;
  build: (nonce: bigint) => SafeProposalRecord;
}) {
  return mutate((records) => {
    const nonce = getNextAvailableSafeNonce({ ...input, proposals: records });
    const decoded = decodeSafeProposal(input.build(nonce));
    if (
      decoded.safeAccountId !== input.safeAccountId ||
      decoded.chainId !== input.chainId ||
      BigInt(decoded.transaction.nonce) !== nonce
    ) {
      throw new Error("Allocated Safe proposal scope changed");
    }
    const existingIndex = records.findIndex((record) => record.id === decoded.id);
    if (existingIndex >= 0) {
      if (isLocallyCancelledUnsignedSafeProposal(records[existingIndex])) {
        const next = [...records];
        // Local cancellation never consumed the nonce. Revive the same Safe
        // identity with the fresh route instead of treating it as active.
        next[existingIndex] = decoded;
        return { records: next, result: decoded };
      }
      throw new Error("Safe proposal already exists");
    }
    if (records.length >= MAX_PROPOSALS) throw new Error("Too many Safe proposals");
    return { records: [...records, decoded], result: decoded };
  });
}

/** Recovers effect claims left durable when a previous service worker stopped. */
export async function recoverInterruptedSafeProposalEffects(
  input: { minimumAgeMs?: number; now?: number; safeAccountId?: string } = {},
): Promise<SafeProposalRecord[]> {
  const now = input.now ?? Date.now();
  const minimumAgeMs = input.minimumAgeMs ?? 0;
  return mutate((records) => {
    const recovered = recoverInterruptedSafeProposalRecords({ records, minimumAgeMs, now, safeAccountId: input.safeAccountId });
    return {
      records: recovered.records,
      result: recovered.recovered.map(decodeSafeProposal),
    };
  });
}

/** Atomically replaces only an unsigned, editable proposal with a new nonce. */
export async function replaceUnsignedSafeProposal(id: string, replacement: SafeProposalRecord) {
  const decoded = decodeSafeProposal(replacement);
  return mutate((records) => {
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error("Safe proposal not found");
    const current = records[index];
    if (!isUnsignedSafeNonceEditable(current) || !isUnsignedSafeNonceEditable(decoded)) {
      throw new Error("Safe nonce can only be changed before signing");
    }
    if (
      decoded.safeAccountId !== current.safeAccountId ||
      decoded.chainId !== current.chainId ||
      decoded.safeAddress !== current.safeAddress ||
      decoded.safeVersion !== current.safeVersion ||
      decoded.safeConfigEpoch !== current.safeConfigEpoch ||
      decoded.createdAt !== current.createdAt ||
      JSON.stringify(decoded.calls) !== JSON.stringify(current.calls) ||
      JSON.stringify(decoded.route) !== JSON.stringify(current.route)
    ) {
      throw new Error("Safe nonce update changed immutable proposal data");
    }
    if (records.some((record, candidate) => candidate !== index && record.id === decoded.id)) {
      throw new Error("An identical Safe proposal already uses this nonce");
    }
    const next = [...records];
    next[index] = decoded;
    return { records: next, result: decoded };
  });
}
export async function updateSafeProposal(id: string, updater: (record: SafeProposalRecord) => SafeProposalRecord) {
  return mutate((records) => {
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error("Safe proposal not found");
    const updated = decodeSafeProposal(updater(records[index]));
    if (updated.id !== id) throw new Error("Cannot change Safe proposal identity");
    const next = [...records]; next[index] = updated;
    return { records: next, result: updated };
  });
}
export async function claimSafeProposalEffect(id: string, input: { kind: "approve" | "publish" | "execute"; ownerAddress?: SafeAddress }) {
  return updateSafeProposal(id, (record) => {
    assertSafeProposalEffectClaimable(record, input);
    return { ...record, effectClaim: { ...input, claimId: crypto.randomUUID(), claimedAt: Date.now() }, updatedAt: Date.now() };
  });
}
export async function releaseSafeProposalEffect(id: string, claimId: string, update: Partial<Pick<SafeProposalRecord, "state" | "confirmations" | "transactionHash" | "userOperationHash" | "serializedExecution" | "executionPreparedAt" | "executor" | "error">> = {}) {
  return updateSafeProposal(id, (record) => {
    if (record.effectClaim?.claimId !== claimId) throw new Error("Safe proposal claim changed");
    return { ...record, ...update, effectClaim: undefined, updatedAt: Date.now() };
  });
}

export async function removeSafeProposalsForAccount(accountId: string): Promise<void> {
  if (await hasUnresolvedSafeEffects(accountId)) {
    throw new Error("Reconcile pending Safe publication or execution before removing this Safe");
  }
  await mutate((records) => ({
    records: records.filter((record) => record.safeAccountId !== accountId),
    result: undefined,
  }));
}

export async function hasUnresolvedSafeEffects(accountId?: string): Promise<boolean> {
  return (await getSafeProposals()).some((record) =>
    (!accountId || record.safeAccountId === accountId) &&
    (
      !!record.effectClaim ||
      hasUnresolvedSafeExecution(record) ||
      ["authorizing", "publishing", "ambiguous"].includes(record.state)
    ),
  );
}
