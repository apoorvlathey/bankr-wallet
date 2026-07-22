import assert from "node:assert/strict";
import test from "node:test";
import {
  getCanonicalMultiSendAddress,
  getSafeSingletonAllowlist,
  isCanonicalSafeProxyRuntime,
  resolveSafeSingleton,
} from "../../src/chrome/safe/deploymentRegistry";
import {
  buildSafeTransactionTypedData,
  computeSafeTransactionHash,
} from "../../src/chrome/safe/transactionHash";
import { buildSafeRejectionTransaction } from "../../src/chrome/safe/transactionBuilder";
import {
  canStartSafeProposalRejection,
  hasSafeProposalSignatures,
  isCanonicalSafeRejection,
} from "../../src/chrome/safe/proposalRejectionPolicy";
import type { SafeProposalRecord } from "../../src/chrome/safe/types";
import type { SafeTransactionData } from "../../src/chrome/safe/types";

const TRANSACTION: SafeTransactionData = {
  to: "0x2222222222222222222222222222222222222222",
  value: "123456789",
  data: "0x12345678",
  operation: 0,
  safeTxGas: "0",
  baseGas: "0",
  gasPrice: "0",
  gasToken: "0x0000000000000000000000000000000000000000",
  refundReceiver: "0x0000000000000000000000000000000000000000",
  nonce: 7,
};

test("Safe transaction hash fixture is deterministic and chain-bound", () => {
  const typedData = buildSafeTransactionTypedData({
    chainId: 8453,
    safeAddress: "0x1111111111111111111111111111111111111111",
    safeVersion: "1.4.1",
    transaction: TRANSACTION,
  });
  assert.equal(typedData.domain.chainId, 8453);
  const baseHash = computeSafeTransactionHash({
    chainId: 8453,
    safeAddress: "0x1111111111111111111111111111111111111111",
    safeVersion: "1.4.1",
    transaction: TRANSACTION,
  });
  assert.equal(
    baseHash,
    "0xd489f2391a8621d4b811b1f3c6bf5839150a11ecd96c2ab3e2e99bf21ea677f2",
  );
  assert.notEqual(
    computeSafeTransactionHash({
      chainId: 1,
      safeAddress: "0x1111111111111111111111111111111111111111",
      safeVersion: "1.4.1",
      transaction: TRANSACTION,
    }),
    baseHash,
  );
  for (const safeVersion of ["1.3.0", "1.4.1", "1.5.0"] as const) {
    assert.equal(
      computeSafeTransactionHash({
        chainId: 8453,
        safeAddress: "0x1111111111111111111111111111111111111111",
        safeVersion,
        transaction: TRANSACTION,
      }),
      baseHash,
      `Safe ${safeVersion} must retain the canonical chain-bound hash`,
    );
  }
});

test("canonical Safe proxy runtime hashes are version pinned", () => {
  assert.equal(isCanonicalSafeProxyRuntime(1, "1.3.0", "0xb89c1b3bdf2cf8827818646bce9a8f6e372885f8c55e5c07acbd307cb133b000"), true);
  assert.equal(isCanonicalSafeProxyRuntime(8453, "1.4.1", "0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c"), true);
  assert.equal(isCanonicalSafeProxyRuntime(1, "1.5.0", "0x4e381985ca68b3e5d27b4425fa581c19cf33146d3f887a3cfca96f55528ea46f"), true);
  assert.equal(isCanonicalSafeProxyRuntime(1, "1.4.1", `0x${"00".repeat(32)}`), false);
  assert.equal(isCanonicalSafeProxyRuntime(324, "1.4.1", "0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c"), false);
});

test("canonical Safe deployment allowlist is chain and version aware", () => {
  for (const chainId of [1, 130, 137, 5042, 8453]) {
    const deployments = getSafeSingletonAllowlist(chainId);
    assert.ok(deployments.length > 0, `missing Safe deployment for ${chainId}`);
    for (const deployment of deployments) {
      assert.equal(
        resolveSafeSingleton(chainId, deployment.address)?.version,
        deployment.version,
      );
    }
    assert.ok(getCanonicalMultiSendAddress(chainId, "1.4.1"));
  }

  assert.equal(
    resolveSafeSingleton(
      1,
      "0x0000000000000000000000000000000000000001",
    ),
    null,
  );
});

test("new official EVM chains can use exact global released artifacts before package mapping", () => {
  const futureChainId = 9_999_999;
  const deployments = getSafeSingletonAllowlist(futureChainId);
  assert.ok(deployments.length > 0);
  assert.ok(getCanonicalMultiSendAddress(futureChainId, "1.4.1"));
  assert.equal(
    resolveSafeSingleton(futureChainId, deployments[0]!.address)?.codeHash,
    deployments[0]!.codeHash,
  );
});

test("Safe rejection transactions match the canonical same-nonce self-call envelope", () => {
  const safeAddress = "0x1111111111111111111111111111111111111111" as const;
  const built = buildSafeRejectionTransaction({
    chainId: 8453,
    safeAddress,
    safeVersion: "1.4.1",
    nonce: 7n,
  });

  assert.deepEqual(built.calls, [{
    to: safeAddress,
    value: "0",
    data: "0x",
    operation: 0,
  }]);
  assert.equal(built.transaction.to, safeAddress);
  assert.equal(built.transaction.value, "0");
  assert.equal(built.transaction.data, "0x");
  assert.equal(built.transaction.operation, 0);
  assert.equal(built.transaction.safeTxGas, "0");
  assert.equal(built.transaction.nonce, 7);
});

test("any supported or unsupported signature requires an onchain Safe rejection", () => {
  const base = {
    safeAddress: "0x1111111111111111111111111111111111111111",
    calls: [{
      to: "0x2222222222222222222222222222222222222222",
      value: "0",
      data: "0x",
      operation: 0,
    }],
    transaction: TRANSACTION,
    confirmations: [],
    state: "draft",
  } as unknown as SafeProposalRecord;

  assert.equal(hasSafeProposalSignatures(base), false);
  assert.equal(canStartSafeProposalRejection(base), true);
  assert.equal(canStartSafeProposalRejection({
    ...base,
    state: "readyToExecute",
    transactionHash: `0x${"44".repeat(32)}`,
  }), false);
  assert.equal(hasSafeProposalSignatures({
    ...base,
    confirmations: [{
      ownerAddress: "0x2222222222222222222222222222222222222222",
      signature: `0x${"11".repeat(65)}`,
      createdAt: 1,
    }],
  }), true);
  assert.equal(hasSafeProposalSignatures({
    ...base,
    unsupportedConfirmations: [{
      ownerAddress: "0x3333333333333333333333333333333333333333",
      signatureType: "contract",
      createdAt: 1,
    }],
  }), true);

  const rejection = {
    ...base,
    purpose: "rejection" as const,
    calls: [{
      to: base.safeAddress,
      value: "0" as const,
      data: "0x" as const,
      operation: 0 as const,
    }],
    transaction: {
      ...TRANSACTION,
      to: base.safeAddress,
      value: "0" as const,
      data: "0x" as const,
      operation: 0 as const,
    },
  };
  assert.equal(isCanonicalSafeRejection(rejection), true);
  assert.equal(canStartSafeProposalRejection(rejection), false);
});
