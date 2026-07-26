import assert from "node:assert/strict";
import test from "node:test";

import {
  getApprovalCleanupDisabledReason,
  getSafeApprovalCleanupDisabledReason,
} from "../../src/components/AssetChanges/approvalCleanupAvailability";

test("only atomic PK and seed requests can add an EOA cleanup call", () => {
  for (const accountType of ["privateKey", "seedPhrase"] as const) {
    assert.equal(
      getApprovalCleanupDisabledReason({
        accountType,
        batchStrategy: "atomic-7702",
      }),
      null,
    );
    assert.match(
      getApprovalCleanupDisabledReason({
        accountType,
        batchStrategy: "auto-sequential",
      }) ?? "",
      /does not support atomic cleanup/,
    );
  }
  for (const accountType of [
    "bankr",
    "ledger",
    "impersonator",
  ] as const) {
    assert.notEqual(
      getApprovalCleanupDisabledReason({
        accountType,
        batchStrategy:
          accountType === "bankr" ? "atomic-bankr" : "auto-sequential",
      }),
      null,
      accountType,
    );
  }
});

test("capability loading and request locks fail closed", () => {
  assert.match(
    getApprovalCleanupDisabledReason({
      accountType: "privateKey",
      batchStrategy: "loading",
    }) ?? "",
    /Checking/,
  );
  assert.equal(
    getApprovalCleanupDisabledReason({
      accountType: "privateKey",
      batchStrategy: "atomic-7702",
      requestBlockedReason: "Request is locked.",
    }),
    "Request is locked.",
  );
});

test("unsigned Safe requests can be edited regardless of later owner signer type", () => {
  assert.equal(
    getSafeApprovalCleanupDisabledReason({ editable: true, busy: false }),
    null,
  );
  assert.match(
    getSafeApprovalCleanupDisabledReason({ editable: false, busy: false }) ?? "",
    /before anyone signs/,
  );
  assert.match(
    getSafeApprovalCleanupDisabledReason({ editable: true, busy: true }) ?? "",
    /current Safe action/,
  );
});
