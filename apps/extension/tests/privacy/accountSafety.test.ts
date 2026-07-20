import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPrivacyAccountRemovalSafe,
  PrivacyAccountRemovalError,
} from "../../src/chrome/privacy/accountSafety";

const ACCOUNT = {
  accountId: "account-1",
  accountAddress: "0x1111111111111111111111111111111111111111",
};
const KEY = {} as CryptoKey;
const validVault = {
  status: "valid" as const,
  record: {
    keyId: "privacy-key",
    recovery: {},
  },
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    readPrivacyVault: async () => ({ status: "missing" as const }),
    listAllPrivacyShieldOperations: async () => [],
    listAllPrivacyRagequits: async () => [],
    readPrivacyAspMasterMaterial: async () => null,
    readPrivacyCommitments: async () => [],
    ...overrides,
  } as any;
}

test("account removal remains available before Shield exists", async () => {
  await assert.doesNotReject(
    assertPrivacyAccountRemovalSafe(ACCOUNT, dependencies()),
  );
});

test("ambiguous Shield submission blocks removal even before a commitment exists", async () => {
  await assert.rejects(
    assertPrivacyAccountRemovalSafe(ACCOUNT, dependencies({
      listAllPrivacyShieldOperations: async () => [{
        summary: { accountId: ACCOUNT.accountId },
        tracking: { state: "submission_unknown" },
      }],
    })),
    PrivacyAccountRemovalError,
  );
});

test("an encrypted active balance blocks removal and a recovered balance does not", async () => {
  const base = {
    readPrivacyVault: async () => validVault,
    readPrivacyAspMasterMaterial: async () => ({
      key: KEY,
      keyId: "privacy-key",
      masterKeys: {},
    }),
  };
  await assert.rejects(
    assertPrivacyAccountRemovalSafe(ACCOUNT, dependencies({
      ...base,
      readPrivacyCommitments: async () => [{
        record: { id: "commitment-1" },
        details: {
          depositor: ACCOUNT.accountAddress,
          status: "private_ready",
        },
      }],
    })),
    PrivacyAccountRemovalError,
  );
  await assert.doesNotReject(
    assertPrivacyAccountRemovalSafe(ACCOUNT, dependencies({
      ...base,
      readPrivacyCommitments: async () => [{
        record: { id: "commitment-1" },
        details: {
          depositor: ACCOUNT.accountAddress,
          status: "ragequit_recovered",
        },
      }],
    })),
  );
});

test("a present Shield identity fails closed when its privacy key is unavailable", async () => {
  await assert.rejects(
    assertPrivacyAccountRemovalSafe(ACCOUNT, dependencies({
      readPrivacyVault: async () => validVault,
    })),
    PrivacyAccountRemovalError,
  );
});
