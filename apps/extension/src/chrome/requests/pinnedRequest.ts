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
 * requests are queued for review. Signing helpers continue to exclude them;
 * the separate per-endpoint developer path may only submit an unsigned RPC
 * transaction.
 */

import type { Account } from "../types";
import type { PinnedTxRequest, PendingTxRequest } from "./pendingTxStorage";
import type {
  PinnedSignatureRequest,
  PendingSignatureRequest,
} from "./pendingSignatureStorage";
import type { PinnedBatchTxRequest, PendingBatchTxRequest } from "../erc5792Types";

export type SigningAccount = Extract<
  Account,
  { type: "bankr" | "privateKey" | "seedPhrase" | "ledger" }
>;

export type ProviderRequestAccount = Exclude<Account, { type: "safe" }>;

export function isRequestSigningAccount(
  account: Account,
): account is SigningAccount {
  return (
    account.type === "bankr" ||
    account.type === "privateKey" ||
    account.type === "seedPhrase" ||
    account.type === "ledger"
  );
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
  account: ProviderRequestAccount,
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
  account: ProviderRequestAccount,
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
  account: ProviderRequestAccount,
  base: BatchBase,
): PinnedBatchTxRequest {
  return {
    ...base,
    accountId: account.id,
    accountAddress: account.address.toLowerCase(),
    accountType: account.type,
  };
}
