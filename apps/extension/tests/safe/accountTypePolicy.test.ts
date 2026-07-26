import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SAFE_ACCOUNT_TYPE_POLICY,
  canExecuteSafeWithFeeToken,
  getSafeExecutionSigningPath,
  getSafeOwnerSigningPath,
  isSafeExecutorAccountType,
  isSafeFeeTokenExecutorAccount,
  isSafeFeeTokenExecutorAccountType,
  isSafeOwnerAccountType,
} from "../../src/chrome/safe/accountTypePolicy";
import type { Account, AccountType } from "../../src/chrome/types";

const accountTypes: AccountType[] = [
  "bankr",
  "privateKey",
  "seedPhrase",
  "ledger",
  "impersonator",
  "safe",
];

function account(type: AccountType): Account {
  return {
    id: type,
    type,
    address: "0x1111111111111111111111111111111111111111",
    createdAt: 1,
    ...(type === "seedPhrase"
      ? { seedGroupId: "seed", derivationIndex: 0 }
      : {}),
    ...(type === "ledger"
      ? {
          deviceId: "device",
          hdPath: "m/44'/60'/0'/0/0",
          hdIndex: 0,
        }
      : {}),
  } as Account;
}

test("one exhaustive policy defines every account type's Safe capabilities", () => {
  assert.deepEqual(Object.keys(SAFE_ACCOUNT_TYPE_POLICY), accountTypes);
  assert.deepEqual(
    accountTypes.filter(isSafeOwnerAccountType),
    ["bankr", "privateKey", "seedPhrase", "ledger"],
  );
  assert.deepEqual(
    accountTypes.filter(isSafeExecutorAccountType),
    ["privateKey", "seedPhrase", "ledger"],
  );
  assert.deepEqual(
    accountTypes.filter(isSafeFeeTokenExecutorAccountType),
    ["privateKey", "seedPhrase"],
  );
  assert.deepEqual(
    accountTypes.map(account).filter(isSafeFeeTokenExecutorAccount).map(
      (candidate) => candidate.type,
    ),
    ["privateKey", "seedPhrase"],
  );
  for (const invalid of ["unknown", "__proto__", "constructor", "toString"]) {
    assert.equal(isSafeOwnerAccountType(invalid), false);
    assert.equal(isSafeExecutorAccountType(invalid), false);
    assert.equal(isSafeFeeTokenExecutorAccountType(invalid), false);
  }
});

test("the policy routes existing Safe signers through their central signing paths", () => {
  assert.equal(getSafeOwnerSigningPath(account("bankr")), "bankr");
  assert.equal(getSafeOwnerSigningPath(account("privateKey")), "local");
  assert.equal(getSafeOwnerSigningPath(account("seedPhrase")), "local");
  assert.equal(getSafeOwnerSigningPath(account("ledger")), "ledger");
  assert.equal(getSafeOwnerSigningPath(account("impersonator")), null);
  assert.equal(getSafeOwnerSigningPath(account("safe")), null);

  assert.equal(getSafeExecutionSigningPath(account("privateKey")), "local");
  assert.equal(getSafeExecutionSigningPath(account("seedPhrase")), "local");
  assert.equal(getSafeExecutionSigningPath(account("ledger")), "ledger");
  assert.equal(getSafeExecutionSigningPath(account("bankr")), null);
  assert.equal(canExecuteSafeWithFeeToken(account("privateKey")), true);
  assert.equal(canExecuteSafeWithFeeToken(account("seedPhrase")), true);
  assert.equal(canExecuteSafeWithFeeToken(account("ledger")), false);
});

test("Safe eligibility consumers import the central account-type policy", async () => {
  const paths = [
    "../../src/chrome/safe/capabilities.ts",
    "../../src/chrome/safe/discovery.ts",
    "../../src/chrome/safe/execution.ts",
    "../../src/chrome/safe/feePaymentExecution.ts",
    "../../src/chrome/safe/ownerAuthorization.ts",
    "../../src/chrome/safe/proposalRepository.ts",
    "../../src/chrome/safe/types.ts",
    "../../src/chrome/feePayment/capabilities.ts",
    "../../src/chrome/feePayment/quotes.ts",
    "../../src/components/SafeAccount/SafeEntryScreen.tsx",
    "../../src/components/SafeApprovals/safeProposalActionModel.ts",
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const [index, source] of sources.entries()) {
    assert.match(
      source,
      /accountTypePolicy/,
      `${paths[index]} must reuse the central Safe account-type policy`,
    );
  }
});
