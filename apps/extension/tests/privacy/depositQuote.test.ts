import assert from "node:assert/strict";
import test from "node:test";
import { formatEther } from "viem";

import type { Account, AccountType } from "../../src/chrome/types";
import { quotePrivacyShield } from "../../src/chrome/privacy/deposit/quote";
import { PrivacyShieldQuoteError } from "../../src/chrome/privacy/deposit/quotePolicy";
import {
  privacyShieldGrossAmountWei,
  privacyShieldNetAmountWei,
} from "../../src/lib/privacyShieldAmounts";

const ADDRESS = "0x1111111111111111111111111111111111111111";

function account(type: AccountType): Account {
  return {
    id: `${type}-1`,
    type,
    address: ADDRESS,
    createdAt: 1,
    ...(type === "seedPhrase"
      ? { seedGroupId: "seed-1", derivationIndex: 0 }
      : {}),
  } as Account;
}

function requestFor(source: Account) {
  return {
    accountId: source.id,
    accountAddress: source.address,
    accountType: source.type,
    amount: "0.1",
  };
}

test("quote supports Bankr, private-key, and seed-phrase source accounts", async () => {
  for (const type of ["bankr", "privateKey", "seedPhrase"] as const) {
    const source = account(type);
    let observedAddress = "";
    const quote = await quotePrivacyShield(requestFor(source), {
      getAccountById: async () => source,
      resolveRpcUrl: async () => "https://sepolia.example",
      readRpcQuote: async (rpcUrl, address, amountWei) => {
        assert.equal(rpcUrl, "https://sepolia.example");
        assert.equal(amountWei, 101_010_101_010_101_010n);
        observedAddress = address;
        return {
          balanceWei: 500_000_000_000_000_000n,
          gasLimit: 100_000n,
          maxFeePerGas: 2_000_000_000n,
        };
      },
    });
    assert.equal(observedAddress, ADDRESS);
    assert.equal(quote.amountWei, "101010101010101010");
    assert.equal(quote.shieldedAmountWei, "100000000000000000");
    assert.equal(quote.canAfford, true);
  }
});

test("Max re-simulates the exact full-balance gross value", async () => {
  const source = account("privateKey");
  const availableGrossAmountWei = 2_000_000_000_000_099n;
  const shieldedAmountWei = privacyShieldNetAmountWei(
    availableGrossAmountWei,
    100n,
  );
  assert.equal(
    privacyShieldGrossAmountWei(shieldedAmountWei, 100n),
    availableGrossAmountWei + 1n,
  );
  const simulatedAmounts: bigint[] = [];

  const quote = await quotePrivacyShield(
    {
      ...requestFor(source),
      amount: formatEther(shieldedAmountWei),
    },
    {
      getAccountById: async () => source,
      resolveRpcUrl: async () => "https://sepolia.example",
      readRpcQuote: async (_rpcUrl, _address, amountWei) => {
        simulatedAmounts.push(amountWei);
        return {
          balanceWei: availableGrossAmountWei + 1n,
          gasLimit: 1n,
          maxFeePerGas: 1n,
        };
      },
    },
  );

  assert.deepEqual(simulatedAmounts, [
    availableGrossAmountWei + 1n,
    availableGrossAmountWei,
  ]);
  assert.equal(quote.amountWei, availableGrossAmountWei.toString());
  assert.equal(quote.totalRequiredWei, quote.balanceWei);
});

test("quote rejects view-only and stale account snapshots before RPC", async () => {
  let rpcCalls = 0;
  const impersonator = account("impersonator");
  await assert.rejects(
    quotePrivacyShield(requestFor(impersonator), {
      getAccountById: async () => impersonator,
      resolveRpcUrl: async () => "https://sepolia.example",
      readRpcQuote: async () => {
        rpcCalls += 1;
        throw new Error("must not run");
      },
    }),
    (error: unknown) =>
      error instanceof PrivacyShieldQuoteError &&
      error.code === "view-only-account",
  );

  const source = account("privateKey");
  await assert.rejects(
    quotePrivacyShield(
      { ...requestFor(source), accountAddress: "0x2222222222222222222222222222222222222222" },
      { getAccountById: async () => source },
    ),
    (error: unknown) =>
      error instanceof PrivacyShieldQuoteError &&
      error.code === "account-unavailable",
  );
  assert.equal(rpcCalls, 0);
});

test("quote maps RPC details to one non-sensitive failure code", async () => {
  const source = account("bankr");
  await assert.rejects(
    quotePrivacyShield(requestFor(source), {
      getAccountById: async () => source,
      resolveRpcUrl: async () => "https://sepolia.example",
      readRpcQuote: async () => {
        throw new Error("remote provider leaked internal detail");
      },
    }),
    (error: unknown) =>
      error instanceof PrivacyShieldQuoteError &&
      error.code === "quote-unavailable" &&
      !error.message.includes("remote provider"),
  );
});
