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

function commitment(status: "private_ready" | "ragequit_recovered") {
  return {
    record: {
      version: 1,
      id: "00000000-0000-4000-8000-000000000001",
      keyId: "privacy-key",
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
      encryptedDetails: {},
    },
    details: {
      version: 1,
      id: "00000000-0000-4000-8000-000000000001",
      chainId: 11_155_111,
      scope: "1",
      poolAddress: "0x2222222222222222222222222222222222222222",
      commitment: "1",
      label: "2",
      valueWei: "1000",
      balanceWei: status === "ragequit_recovered" ? "0" : "1000",
      precommitment: "3",
      depositIndex: "0",
      depositor: ACCOUNT.accountAddress,
      depositTxHash: `0x${"11".repeat(32)}`,
      depositBlockNumber: "1",
      withdrawalIndex: "0",
      status,
      sourceOperationId: null,
    },
  };
}

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
      readPrivacyCommitments: async () => [commitment("private_ready")],
    })),
    PrivacyAccountRemovalError,
  );
  await assert.doesNotReject(
    assertPrivacyAccountRemovalSafe(ACCOUNT, dependencies({
      ...base,
      readPrivacyCommitments: async () => [commitment("ragequit_recovered")],
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
