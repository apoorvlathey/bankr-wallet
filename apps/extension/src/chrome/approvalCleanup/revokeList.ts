import { MAX_BATCH_CALLS } from "../provider/limits";
import {
  buildApprovalRevokeCall,
  type ApprovalRevokeCall,
} from "./revokeCall";

export interface ApprovalRevokeTarget {
  tokenAddress: unknown;
  spender: unknown;
}

/** Validate, normalize, and pair-deduplicate one bounded cleanup list. */
export function buildApprovalRevokeCalls(
  rawTargets: unknown,
): ApprovalRevokeCall[] {
  if (
    !Array.isArray(rawTargets) ||
    rawTargets.length === 0 ||
    rawTargets.length > MAX_BATCH_CALLS
  ) {
    throw new Error("Invalid approval cleanup list");
  }
  const byPair = new Map<string, ApprovalRevokeCall>();
  for (const rawTarget of rawTargets) {
    if (!rawTarget || typeof rawTarget !== "object") {
      throw new Error("Invalid approval cleanup target");
    }
    const target = rawTarget as ApprovalRevokeTarget;
    const revoke = buildApprovalRevokeCall(
      target.tokenAddress,
      target.spender,
    );
    const key =
      `${revoke.tokenAddress.toLowerCase()}:${revoke.spender.toLowerCase()}`;
    if (!byPair.has(key)) byPair.set(key, revoke);
  }
  return [...byPair.values()];
}
