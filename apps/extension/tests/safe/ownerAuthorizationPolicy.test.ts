import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isAgentPasswordAllowedForSafeOperation,
  mergeSafeOwnerConfirmation,
} from "../../src/chrome/safe/ownerAuthorization";
import {
  getSafeOwnerSigningPath,
} from "../../src/chrome/safe/accountTypePolicy";
import { validateSafeGasOverrides } from "../../src/chrome/safe/execution";
import type { Account } from "../../src/chrome/types";

const base = {
  id: "account",
  address: "0x1111111111111111111111111111111111111111",
  createdAt: 1,
};

const ownerAuthorizationUrl = new URL(
  "../../src/chrome/safe/ownerAuthorization.ts",
  import.meta.url,
);
const executionUrl = new URL(
  "../../src/chrome/safe/execution.ts",
  import.meta.url,
);

test("Safe owner authorization routes every supported wallet type explicitly", () => {
  assert.equal(getSafeOwnerSigningPath({ ...base, type: "bankr" } as Account), "bankr");
  assert.equal(getSafeOwnerSigningPath({ ...base, type: "privateKey" } as Account), "local");
  assert.equal(getSafeOwnerSigningPath({ ...base, type: "seedPhrase" } as Account), "local");
  assert.equal(getSafeOwnerSigningPath({ ...base, type: "ledger" } as Account), "ledger");
  assert.equal(getSafeOwnerSigningPath({ ...base, type: "impersonator" } as Account), null);
  assert.equal(getSafeOwnerSigningPath({ ...base, type: "safe" } as Account), null);
});

test("agent password policy permits ordinary Safe effects but never secret reveal or authority changes", () => {
  assert.equal(isAgentPasswordAllowedForSafeOperation("approve"), true);
  assert.equal(isAgentPasswordAllowedForSafeOperation("execute"), true);
  assert.equal(isAgentPasswordAllowedForSafeOperation("revealSecret"), false);
  assert.equal(isAgentPasswordAllowedForSafeOperation("changeConfiguration"), false);
});

test("a completed hardware approval preserves confirmations received while signing", () => {
  const remote = {
    ownerAddress: "0x2222222222222222222222222222222222222222" as const,
    signature: `0x${"22".repeat(65)}` as `0x${string}`,
    createdAt: 2,
    publishedAt: 3,
  };
  const ledger = {
    ownerAddress: "0x1111111111111111111111111111111111111111" as const,
    accountId: "ledger-owner",
    accountType: "ledger" as const,
    signature: `0x${"11".repeat(65)}` as `0x${string}`,
    createdAt: 4,
  };

  const merged = mergeSafeOwnerConfirmation([remote], ledger);

  assert.deepEqual(merged, [remote, ledger]);
});

test("Safe approval and execution reuse the centralized unlocked session", async () => {
  const [approvalSource, executionSource] = await Promise.all([
    readFile(ownerAuthorizationUrl, "utf8"),
    readFile(executionUrl, "utf8"),
  ]);

  assert.match(approvalSource, /getUnlockedBankrApiKey\(\)/);
  assert.match(approvalSource, /getLocalPrivateKeyForAccount\(/);
  assert.match(approvalSource, /signLedgerTypedDataForAccount\(/);
  assert.match(executionSource, /getLocalPrivateKeyForAccount\(/);
  assert.match(executionSource, /signAndBroadcastLedgerTransaction\(/);
  assert.match(executionSource, /canExecuteSafeWithFeeToken\(/);
  assert.doesNotMatch(approvalSource, /Password is required for each Safe approval/);
  assert.doesNotMatch(executionSource, /handleUnlockWallet\(input\.password\)/);
  assert.doesNotMatch(approvalSource, /input\.password/);
  assert.doesNotMatch(executionSource, /input\.password/);
});

test("Safe execution accepts only bounded canonical fee quantities", () => {
  assert.deepEqual(
    validateSafeGasOverrides({
      gasLimit: "21000",
      maxFeePerGas: "2000000000",
      maxPriorityFeePerGas: "1000000000",
    }),
    {
      gas: "21000",
      maxFeePerGas: "2000000000",
      maxPriorityFeePerGas: "1000000000",
    },
  );
  assert.throws(() => validateSafeGasOverrides({
    gasLimit: "021000",
    maxFeePerGas: "2",
    maxPriorityFeePerGas: "1",
  }));
  assert.throws(() => validateSafeGasOverrides({
    gasLimit: "21000",
    maxFeePerGas: "1",
    maxPriorityFeePerGas: "2",
  }));
  assert.throws(() => validateSafeGasOverrides({
    gasLimit: "1".repeat(79),
    maxFeePerGas: "2",
    maxPriorityFeePerGas: "1",
  }));
});
