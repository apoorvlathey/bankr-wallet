import type { Account, AccountType } from "../types";

export type SafeOwnerSigningPath = "bankr" | "local" | "ledger";
export type SafeExecutionSigningPath = "local" | "ledger";

interface SafeAccountTypePolicy {
  ownerSigningPath: SafeOwnerSigningPath | null;
  executionSigningPath: SafeExecutionSigningPath | null;
  feeTokenExecution: boolean;
}

/**
 * Single extension point for account types that can approve or execute Safe
 * transactions. Every AccountType is listed so adding a new wallet type fails
 * compilation until its Safe capabilities are chosen deliberately.
 */
export const SAFE_ACCOUNT_TYPE_POLICY = {
  bankr: {
    ownerSigningPath: "bankr",
    executionSigningPath: null,
    feeTokenExecution: false,
  },
  privateKey: {
    ownerSigningPath: "local",
    executionSigningPath: "local",
    feeTokenExecution: true,
  },
  seedPhrase: {
    ownerSigningPath: "local",
    executionSigningPath: "local",
    feeTokenExecution: true,
  },
  ledger: {
    ownerSigningPath: "ledger",
    executionSigningPath: "ledger",
    feeTokenExecution: false,
  },
  impersonator: {
    ownerSigningPath: null,
    executionSigningPath: null,
    feeTokenExecution: false,
  },
  safe: {
    ownerSigningPath: null,
    executionSigningPath: null,
    feeTokenExecution: false,
  },
} as const satisfies Record<AccountType, SafeAccountTypePolicy>;

type AccountTypesWith<
  Capability extends keyof SafeAccountTypePolicy,
  Value,
> = {
  [Type in AccountType]:
    (typeof SAFE_ACCOUNT_TYPE_POLICY)[Type][Capability] extends Value
      ? Type
      : never;
}[AccountType];

export type SafeOwnerAccountType = AccountTypesWith<
  "ownerSigningPath",
  SafeOwnerSigningPath
>;
export type SafeExecutorAccountType = AccountTypesWith<
  "executionSigningPath",
  SafeExecutionSigningPath
>;
export type SafeFeeTokenExecutorAccountType = AccountTypesWith<
  "feeTokenExecution",
  true
>;

export type SafeOwnerAccount = Extract<
  Account,
  { type: SafeOwnerAccountType }
>;
export type SafeExecutorAccount = Extract<
  Account,
  { type: SafeExecutorAccountType }
>;
export type SafeFeeTokenExecutorAccount = Extract<
  Account,
  { type: SafeFeeTokenExecutorAccountType }
>;

function isAccountType(value: unknown): value is AccountType {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SAFE_ACCOUNT_TYPE_POLICY, value);
}

export function isSafeOwnerAccountType(
  value: unknown,
): value is SafeOwnerAccountType {
  return isAccountType(value) &&
    SAFE_ACCOUNT_TYPE_POLICY[value].ownerSigningPath !== null;
}

export function isSafeExecutorAccountType(
  value: unknown,
): value is SafeExecutorAccountType {
  return isAccountType(value) &&
    SAFE_ACCOUNT_TYPE_POLICY[value].executionSigningPath !== null;
}

export function isSafeFeeTokenExecutorAccountType(
  value: unknown,
): value is SafeFeeTokenExecutorAccountType {
  return isAccountType(value) &&
    SAFE_ACCOUNT_TYPE_POLICY[value].feeTokenExecution;
}

export function isSafeOwnerAccount(
  account: Account,
): account is SafeOwnerAccount {
  return isSafeOwnerAccountType(account.type);
}

export function isSafeExecutorAccount(
  account: Account,
): account is SafeExecutorAccount {
  return isSafeExecutorAccountType(account.type);
}

export function isSafeFeeTokenExecutorAccount(
  account: Account,
): account is SafeFeeTokenExecutorAccount {
  return isSafeFeeTokenExecutorAccountType(account.type);
}

export function getSafeOwnerSigningPath(
  account: Pick<Account, "type">,
): SafeOwnerSigningPath | null {
  return SAFE_ACCOUNT_TYPE_POLICY[account.type].ownerSigningPath;
}

export function getSafeExecutionSigningPath(
  account: Pick<Account, "type">,
): SafeExecutionSigningPath | null {
  return SAFE_ACCOUNT_TYPE_POLICY[account.type].executionSigningPath;
}

export function canExecuteSafeWithFeeToken(
  account: Pick<Account, "type">,
): boolean {
  return SAFE_ACCOUNT_TYPE_POLICY[account.type].feeTokenExecution;
}
