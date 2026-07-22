import type { Account, AccountType } from "../../types";
import { PRIVACY_POOLS_RELEASE_POLICY } from "./manifest";
import type { PrivacyPoolsReleasePolicy } from "./types";

export type PrivacyPoolsMutationAccountType = Extract<
  AccountType,
  "bankr" | "privateKey" | "seedPhrase"
>;

export type PrivacyPoolsMutationAccount = Extract<
  Account,
  { type: PrivacyPoolsMutationAccountType }
>;

export function isPrivacyPoolsCustodyAccountType(
  accountType: AccountType,
): accountType is PrivacyPoolsMutationAccountType {
  return (
    accountType === "bankr" ||
    accountType === "privateKey" ||
    accountType === "seedPhrase"
  );
}

export function isPrivacyPoolsMutationAccountType(
  accountType: AccountType,
  releasePolicy: PrivacyPoolsReleasePolicy = PRIVACY_POOLS_RELEASE_POLICY,
): accountType is PrivacyPoolsMutationAccountType {
  if (!isPrivacyPoolsCustodyAccountType(accountType)) return false;
  return accountType !== "bankr" || releasePolicy.bankrMutations === "enabled";
}

export function isPrivacyPoolsMutationAccount(
  account: Account,
): account is PrivacyPoolsMutationAccount {
  return isPrivacyPoolsMutationAccountType(account.type);
}
