import assert from "node:assert/strict";
import test from "node:test";

import type { Account } from "../../src/chrome/types";
import {
  getWalletConnectMethodsForAccount,
  isSessionAccount,
  resolveSessionAccount,
} from "../../src/chrome/walletConnect/sessionAccountPolicy";
import {
  WALLETCONNECT_SUPPORTED_METHODS,
  isSigningAccount,
  resolveSessionSigningAccount,
} from "../../src/chrome/walletConnect/sessionPolicy";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const BASE_ACCOUNT = {
  address: ADDRESS,
  displayName: "Test",
  createdAt: 1,
};
const ACCOUNTS = {
  bankr: { ...BASE_ACCOUNT, id: "bankr", type: "bankr" },
  privateKey: { ...BASE_ACCOUNT, id: "private-key", type: "privateKey" },
  seedPhrase: {
    ...BASE_ACCOUNT,
    id: "seed-phrase",
    type: "seedPhrase",
    seedGroupId: "seed-group",
    derivationIndex: 0,
  },
  ledger: {
    ...BASE_ACCOUNT,
    id: "ledger",
    type: "ledger",
    deviceId: ADDRESS.toLowerCase(),
    hdPath: "m/44'/60'/0'/0/0",
    hdIndex: 0,
  },
  safe: { ...BASE_ACCOUNT, id: "safe", type: "safe" },
  impersonator: {
    ...BASE_ACCOUNT,
    id: "impersonator",
    type: "impersonator",
  },
} satisfies Record<string, Account>;

const session = {
  namespaces: {
    eip155: {
      accounts: [`eip155:1:${ADDRESS}`],
      methods: WALLETCONNECT_SUPPORTED_METHODS,
    },
  },
};

test("WalletConnect admits every signer and Safe but rejects view-only accounts", () => {
  for (const type of ["bankr", "privateKey", "seedPhrase", "ledger"] as const) {
    assert.equal(isSigningAccount(ACCOUNTS[type]), true, type);
    assert.equal(isSessionAccount(ACCOUNTS[type]), true, type);
  }
  assert.equal(isSigningAccount(ACCOUNTS.safe), false);
  assert.equal(isSessionAccount(ACCOUNTS.safe), true);
  assert.equal(isSigningAccount(ACCOUNTS.impersonator), false);
  assert.equal(isSessionAccount(ACCOUNTS.impersonator), false);
});

test("WalletConnect advertises account-specific signing and batching methods", () => {
  for (const type of ["bankr", "privateKey", "seedPhrase"] as const) {
    assert.deepEqual(
      getWalletConnectMethodsForAccount(ACCOUNTS[type]),
      WALLETCONNECT_SUPPORTED_METHODS,
      type,
    );
  }

  const ledgerMethods = getWalletConnectMethodsForAccount(ACCOUNTS.ledger);
  assert.ok(ledgerMethods.includes("eth_sendTransaction"));
  assert.ok(ledgerMethods.includes("personal_sign"));
  assert.ok(ledgerMethods.includes("eth_signTypedData_v4"));
  assert.ok(!ledgerMethods.includes("wallet_getCapabilities"));
  assert.ok(!ledgerMethods.includes("wallet_sendCalls"));
  assert.ok(!ledgerMethods.includes("wallet_requestExecutionPermissions"));

  const safeMethods = getWalletConnectMethodsForAccount(ACCOUNTS.safe);
  assert.ok(safeMethods.includes("eth_sendTransaction"));
  assert.ok(safeMethods.includes("wallet_getCapabilities"));
  assert.ok(safeMethods.includes("wallet_sendCalls"));
  assert.ok(safeMethods.includes("wallet_getCallsStatus"));
  assert.ok(!safeMethods.includes("personal_sign"));
  assert.ok(!safeMethods.includes("eth_signTypedData_v4"));
  assert.ok(!safeMethods.includes("wallet_requestExecutionPermissions"));
});

test("WalletConnect resolves all four signing wallet types and Safe exactly", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  let storedAccounts: Account[] = [];
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get() {
            return { accounts: storedAccounts };
          },
        },
      },
    },
  });

  try {
    for (const type of [
      "bankr",
      "privateKey",
      "seedPhrase",
      "ledger",
    ] as const) {
      await t.test(type, async () => {
        storedAccounts = [ACCOUNTS[type]];
        assert.equal(
          (await resolveSessionAccount(session, 1, ADDRESS)).type,
          type,
        );
        assert.equal(
          (await resolveSessionSigningAccount(session, 1, ADDRESS)).type,
          type,
        );
      });
    }

    await t.test("safe", async () => {
      storedAccounts = [ACCOUNTS.safe];
      assert.equal(
        (await resolveSessionAccount(session, 1, ADDRESS)).type,
        "safe",
      );
      await assert.rejects(
        resolveSessionSigningAccount(session, 1, ADDRESS),
        /Safe smart-account message signing is not supported/,
      );
    });

    await t.test("impersonator", async () => {
      storedAccounts = [ACCOUNTS.impersonator];
      await assert.rejects(
        resolveSessionAccount(session, 1, ADDRESS),
        /No supported account found/,
      );
      await assert.rejects(
        resolveSessionSigningAccount(session, 1, ADDRESS),
        /No signing account found/,
      );
    });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      delete (globalThis as { chrome?: unknown }).chrome;
    }
  }
});
