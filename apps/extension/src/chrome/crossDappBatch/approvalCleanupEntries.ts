import {
  buildApprovalRevokeCall,
  isSameApprovalRevokeCall,
  type ApprovalRevokeCall,
} from "../approvalCleanup/revokeCall";
import { MAX_BATCH_CALLS } from "../provider/limits";
import type {
  CrossDappBatch,
  CrossDappBatchEntry,
} from "./storage";

interface IndexedRevoke {
  revoke: ApprovalRevokeCall;
  sourceCallIndex: number;
}

export function resolveApprovalCleanupAdditions(
  batch: CrossDappBatch,
  rawTargets: unknown,
):
  | { ok: true; additions: IndexedRevoke[] }
  | { ok: false; error: string } {
  if (
    !Array.isArray(rawTargets) ||
    rawTargets.length === 0 ||
    rawTargets.length > MAX_BATCH_CALLS
  ) {
    throw new Error("Invalid approval cleanup list");
  }
  const byPair = new Map<string, {
    revoke: ApprovalRevokeCall;
    sourceCallIndex: unknown;
  }>();
  for (const rawTarget of rawTargets) {
    if (!rawTarget || typeof rawTarget !== "object") {
      throw new Error("Invalid approval cleanup target");
    }
    const target = rawTarget as {
      tokenAddress?: unknown;
      spender?: unknown;
      sourceCallIndex?: unknown;
    };
    const revoke = buildApprovalRevokeCall(
      target.tokenAddress,
      target.spender,
    );
    const key =
      `${revoke.tokenAddress.toLowerCase()}:${revoke.spender.toLowerCase()}`;
    if (!byPair.has(key)) {
      byPair.set(key, {
        revoke,
        sourceCallIndex: target.sourceCallIndex,
      });
    }
  }
  const candidates: IndexedRevoke[] = [];
  for (const candidate of byPair.values()) {
    const { sourceCallIndex } = candidate;
    if (
      typeof sourceCallIndex !== "number" ||
      !Number.isInteger(sourceCallIndex) ||
      sourceCallIndex < 0 ||
      sourceCallIndex >= batch.entries.length ||
      batch.entries[sourceCallIndex].source?.kind === "walletGenerated"
    ) {
      return {
        ok: false,
        error: "Approval source call is no longer available",
      };
    }
    candidates.push({
      revoke: candidate.revoke,
      sourceCallIndex,
    });
  }
  const additions = candidates.filter(({ revoke, sourceCallIndex }) => {
    const existingIndex = batch.entries.findIndex((entry) =>
      isSameApprovalRevokeCall(entry.tx, revoke)
    );
    return existingIndex === -1 || existingIndex <= sourceCallIndex;
  });
  if (batch.entries.length + additions.length > MAX_BATCH_CALLS) {
    return {
      ok: false,
      error: "Pending batch has reached the call limit",
    };
  }
  return { ok: true, additions };
}

export function buildWalletGeneratedApprovalCleanupEntry(
  batch: Pick<CrossDappBatch, "fromAddress" | "chainId" | "accountType">,
  parent: CrossDappBatchEntry,
  revoke: ApprovalRevokeCall,
): CrossDappBatchEntry {
  const source = parent.source?.kind === "wallet_sendCalls"
    ? {
        kind: "walletGenerated" as const,
        parentTxId: parent.txId,
        parentBundleId: parent.source.bundleId,
        reason: "approvalRevoke" as const,
      }
    : {
        kind: "walletGenerated" as const,
        parentTxId: parent.txId,
        reason: "approvalRevoke" as const,
      };
  return {
    txId:
      `${parent.txId}:approval-revoke:${revoke.tokenAddress}:${revoke.spender}`,
    tx: {
      from: batch.fromAddress as `0x${string}`,
      to: revoke.call.to,
      data: revoke.call.data,
      value: revoke.call.value,
      chainId: batch.chainId,
    },
    origin: "WalletChan",
    favicon: "/walletchan-icon.png",
    addedAt: Date.now(),
    source,
    accountType: batch.accountType,
  };
}
