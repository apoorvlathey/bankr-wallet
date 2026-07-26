import type { Account } from "../types";
import { isSafeOwnerAccount } from "./accountTypePolicy";
import type {
  SafeCapability,
  SafeChainSnapshot,
  SafeLinkedOwner,
} from "./types";

export function getLinkedSafeOwners(
  snapshot: SafeChainSnapshot,
  accounts: readonly Account[],
): SafeLinkedOwner[] {
  const owners = new Set(snapshot.owners.map((owner) => owner.toLowerCase()));
  return accounts.flatMap((account) => {
    if (!isSafeOwnerAccount(account)) return [];
    if (!owners.has(account.address.toLowerCase())) return [];
    return [{
      ownerAddress: account.address.toLowerCase() as SafeLinkedOwner["ownerAddress"],
      accountId: account.id,
      accountType: account.type,
    }];
  });
}

export function deriveSafeCapability(input: {
  snapshot: SafeChainSnapshot;
  accounts: readonly Account[];
  validApprovalCount?: number;
}): SafeCapability {
  if (input.snapshot.blockedReason) return "blocked";
  const linkedAddresses = new Set(
    getLinkedSafeOwners(input.snapshot, input.accounts).map(
      (owner) => owner.ownerAddress,
    ),
  );
  const approvals = input.validApprovalCount ?? 0;
  if (approvals >= input.snapshot.threshold) return "readyToExecute";
  if (linkedAddresses.size >= input.snapshot.threshold) return "quorumAvailable";
  if (linkedAddresses.size > 0) return "approve";
  return "observe";
}

export function withDerivedSafeCapability(
  snapshot: SafeChainSnapshot,
  accounts: readonly Account[],
  validApprovalCount?: number,
): SafeChainSnapshot {
  return {
    ...snapshot,
    capability: deriveSafeCapability({ snapshot, accounts, validApprovalCount }),
  };
}
