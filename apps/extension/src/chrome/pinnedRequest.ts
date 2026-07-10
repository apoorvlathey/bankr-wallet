/**
 * Factories that construct pending request objects with the security-pinning
 * fields populated from a live `Account`. These are the ONLY supported way
 * to build a request that gets passed to `savePendingTxRequest` /
 * `savePendingSignatureRequest` / `savePendingBatchTxRequest`.
 *
 * The save functions accept the `Pinned*Request` types (where pinning fields
 * are required), so any creation site that doesn't go through these
 * factories — or otherwise fails to set `accountId` / `accountAddress` /
 * `accountType` — is a TypeScript error.
 *
 * Tx and signature factories accept impersonator accounts because their
 * requests are queued for Reject-only review. Actual signer resolution and
 * signing helpers continue to exclude impersonators at confirm time.
 */

import type { Account } from "./types";
import type { PinnedTxRequest, PendingTxRequest } from "./pendingTxStorage";
import type {
  PinnedSignatureRequest,
  PendingSignatureRequest,
} from "./pendingSignatureStorage";
import type { PinnedBatchTxRequest, PendingBatchTxRequest } from "./erc5792Types";

export type SigningAccount = Exclude<Account, { type: "impersonator" }>;

export function isRequestSigningAccount(
  account: Account,
): account is SigningAccount {
  return account.type !== "impersonator";
}

type TxBase = Omit<
  PendingTxRequest,
  "accountId" | "accountAddress" | "accountType"
>;
type SigBase = Omit<
  PendingSignatureRequest,
  "accountId" | "accountAddress" | "accountType"
>;
type BatchBase = Omit<
  PendingBatchTxRequest,
  "accountId" | "accountAddress" | "accountType"
>;

export function pinnedTxRequest(
  account: Account,
  base: TxBase,
): PinnedTxRequest {
  return {
    ...base,
    accountId: account.id,
    accountAddress: account.address.toLowerCase(),
    accountType: account.type,
  };
}

export function pinnedSignatureRequest(
  account: Account,
  base: SigBase,
): PinnedSignatureRequest {
  return {
    ...base,
    accountId: account.id,
    accountAddress: account.address.toLowerCase(),
    accountType: account.type,
  };
}

export function pinnedBatchTxRequest(
  account: Account,
  base: BatchBase,
): PinnedBatchTxRequest {
  return {
    ...base,
    accountId: account.id,
    accountAddress: account.address.toLowerCase(),
    accountType: account.type,
  };
}
