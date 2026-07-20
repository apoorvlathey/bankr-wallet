import type { AccountType } from "../../types";
import { PRIVACY_POOLS_RELEASE_POLICY } from "./manifest";
import type { PrivacyPoolsReleasePolicy } from "./types";

export function isPrivacyPoolsMutationAccountType(
  accountType: AccountType,
  releasePolicy: PrivacyPoolsReleasePolicy = PRIVACY_POOLS_RELEASE_POLICY,
): accountType is Exclude<AccountType, "impersonator"> {
  if (accountType === "impersonator") return false;
  return accountType !== "bankr" || releasePolicy.bankrMutations === "enabled";
}
