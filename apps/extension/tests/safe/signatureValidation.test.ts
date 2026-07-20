import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { buildSafeTransactionTypedData } from "../../src/chrome/safe/transactionHash";
import { buildSafeTransaction } from "../../src/chrome/safe/transactionBuilder";
import { packSafeSignatures, validateSafeOwnerConfirmation } from "../../src/chrome/safe/signatureValidation";
import type { SafeProposalRecord } from "../../src/chrome/safe/types";

const keyA = `0x${"01".repeat(32)}` as const;
const keyB = `0x${"02".repeat(32)}` as const;
const keyC = `0x${"03".repeat(32)}` as const;

async function signed(key: `0x${string}`) {
  const account = privateKeyToAccount(key);
  const safeAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  const built = buildSafeTransaction({
    chainId: 8453,
    safeAddress,
    safeVersion: "1.4.1",
    nonce: 0n,
    calls: [{ to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", value: "0", data: "0x1234", operation: 0 }],
  });
  const typed = buildSafeTransactionTypedData({ chainId: 8453, safeAddress, safeVersion: "1.4.1", transaction: built.transaction });
  const types = Object.fromEntries(
    Object.entries(typed.types).filter(([typeName]) => typeName !== "EIP712Domain"),
  );
  const signature = await account.signTypedData({
    domain: { ...typed.domain, chainId: BigInt(typed.domain.chainId!) },
    types,
    primaryType: typed.primaryType,
    message: typed.message,
  });
  const now = Date.now();
  const proposal = {
    version: 1,
    id: `8453:${safeAddress}:${built.safeTxHash}`,
    chainId: 8453,
    safeAccountId: "safe",
    safeAddress,
    safeTxHash: built.safeTxHash,
    safeVersion: "1.4.1",
    safeConfigEpoch: `0x${"12".repeat(32)}`,
    verifiedAtBlock: "1",
    calls: built.calls,
    transaction: built.transaction,
    state: "draft",
    confirmations: [],
    route: { kind: "wallet" },
    createdAt: now,
    updatedAt: now,
  } as SafeProposalRecord;
  return { account, proposal, signature };
}

test("owner signatures recover against the exact Safe typed data", async () => {
  const a = await signed(keyA);
  const confirmation = await validateSafeOwnerConfirmation({
    proposal: a.proposal,
    signature: a.signature,
    expectedOwner: a.account.address.toLowerCase() as `0x${string}`,
    currentOwners: [a.account.address.toLowerCase() as `0x${string}`],
    accountId: "account-a",
    accountType: "privateKey",
  });
  assert.equal(confirmation.ownerAddress, a.account.address.toLowerCase());
  await assert.rejects(() => validateSafeOwnerConfirmation({
    proposal: a.proposal,
    signature: a.signature,
    expectedOwner: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    currentOwners: [a.account.address.toLowerCase() as `0x${string}`],
    accountId: "wrong",
    accountType: "seedPhrase",
  }), /no longer a Safe owner/);
});

test("packed Safe signatures are sorted by recovered owner address", async () => {
  const a = await signed(keyA);
  const b = await signed(keyB);
  const confirmation = (item: Awaited<ReturnType<typeof signed>>, id: string) => ({
    ownerAddress: item.account.address.toLowerCase() as `0x${string}`,
    accountId: id,
    accountType: "privateKey" as const,
    signature: item.signature,
    createdAt: 1,
  });
  const first = packSafeSignatures([confirmation(b, "b"), confirmation(a, "a")]);
  const second = packSafeSignatures([confirmation(a, "a"), confirmation(b, "b")]);
  assert.equal(first, second);
});

test("Bankr, private-key, and seed owner confirmations share the exact Safe signature contract", async () => {
  const fixtures = await Promise.all([signed(keyA), signed(keyB), signed(keyC)]);
  const accountTypes = ["bankr", "privateKey", "seedPhrase"] as const;
  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index];
    const confirmation = await validateSafeOwnerConfirmation({
      proposal: fixture.proposal,
      signature: fixture.signature,
      expectedOwner: fixture.account.address.toLowerCase() as `0x${string}`,
      currentOwners: [fixture.account.address.toLowerCase() as `0x${string}`],
      accountId: `owner-${accountTypes[index]}`,
      accountType: accountTypes[index],
    });
    assert.equal(confirmation.accountType, accountTypes[index]);
    assert.equal(confirmation.ownerAddress, fixture.account.address.toLowerCase());
  }
});
