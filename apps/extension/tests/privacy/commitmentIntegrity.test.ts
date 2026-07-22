import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalPrivacyCommitments,
  privacyCommitmentLineageKey,
  type PrivacyCommitmentRecordWithDetails,
} from "../../src/chrome/privacy/commitments/lineageIntegrity";
import {
  assertPrivacyCommitmentSpendable,
  PrivacyCommitmentSpendabilityError,
} from "../../src/chrome/privacy/commitments/spendability";
import type {
  PrivacyCommitmentDetailsV1,
  StoredPrivacyCommitmentV1,
} from "../../src/chrome/privacy/commitments/types";
import { PRIVACY_POOLS_DEPLOYMENT } from "../../src/chrome/privacy/deployment/manifest";
import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositPrecommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolMasterKeys,
  derivePrivacyPoolWithdrawalSecrets,
} from "../../src/chrome/privacy/protocol/primitives";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const DEPOSITOR = "0x1111111111111111111111111111111111111111" as const;
const DEPOSIT_TX = `0x${"22".repeat(32)}` as const;
const LABEL = 456n;
const masterKeys = derivePrivacyPoolMasterKeys(PHRASE);
const depositSecrets = derivePrivacyPoolDepositSecrets(
  masterKeys,
  PRIVACY_POOLS_DEPLOYMENT.scope,
  0n,
);

function stored(id: string, revision = 0, updatedAt = 1): StoredPrivacyCommitmentV1 {
  return {
    version: 1,
    id,
    keyId: "privacy-key",
    revision,
    createdAt: 1,
    updatedAt,
    encryptedDetails: {
      version: 1,
      scheme: "privacy-commitment-key",
      ciphertext: "ignored",
      iv: "ignored",
    },
  };
}

function details(input: {
  id: string;
  balanceWei: bigint;
  withdrawalIndex: bigint;
  status?: PrivacyCommitmentDetailsV1["status"];
}): PrivacyCommitmentDetailsV1 {
  const secrets = input.withdrawalIndex === 0n
    ? depositSecrets
    : derivePrivacyPoolWithdrawalSecrets(masterKeys, LABEL, input.withdrawalIndex - 1n);
  const commitment = derivePrivacyPoolCommitment(input.balanceWei, LABEL, secrets);
  return {
    version: 1,
    id: input.id,
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    scope: PRIVACY_POOLS_DEPLOYMENT.scope.toString(),
    poolAddress: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
    commitment: commitment.hash.toString(),
    label: LABEL.toString(),
    valueWei: "1000",
    balanceWei: input.balanceWei.toString(),
    precommitment: derivePrivacyPoolDepositPrecommitment(depositSecrets).toString(),
    depositIndex: "0",
    depositor: DEPOSITOR,
    depositTxHash: DEPOSIT_TX,
    depositBlockNumber: "100",
    withdrawalIndex: input.withdrawalIndex.toString(),
    status: input.status ?? "private_ready",
    sourceOperationId: "00000000-0000-4000-8000-000000000099",
  };
}

function entry(
  commitment: PrivacyCommitmentDetailsV1,
  revision = 0,
  updatedAt = 1,
): PrivacyCommitmentRecordWithDetails {
  return { record: stored(commitment.id, revision, updatedAt), details: commitment };
}

test("canonical commitment lineage keeps only the latest partial-withdrawal note", () => {
  const original = details({
    id: "00000000-0000-4000-8000-000000000001",
    balanceWei: 1000n,
    withdrawalIndex: 0n,
  });
  const replacement = details({
    id: "00000000-0000-4000-8000-000000000002",
    balanceWei: 750n,
    withdrawalIndex: 1n,
  });

  assert.equal(privacyCommitmentLineageKey(original), privacyCommitmentLineageKey(replacement));
  assert.deepEqual(
    canonicalPrivacyCommitments([entry(original), entry(replacement)]),
    [entry(replacement)],
  );
});

test("canonical commitment lineage prefers a verified terminal state and rejects forks", () => {
  const active = details({
    id: "00000000-0000-4000-8000-000000000003",
    balanceWei: 1000n,
    withdrawalIndex: 0n,
  });
  const recovered = {
    ...active,
    id: "00000000-0000-4000-8000-000000000004",
    balanceWei: "0",
    status: "ragequit_recovered" as const,
  };
  assert.equal(
    canonicalPrivacyCommitments([entry(active), entry(recovered)])[0].details.status,
    "ragequit_recovered",
  );

  const fork = {
    ...active,
    id: "00000000-0000-4000-8000-000000000005",
    commitment: (BigInt(active.commitment) + 1n).toString(),
  };
  assert.throws(
    () => canonicalPrivacyCommitments([entry(active), entry(fork)]),
    /Conflicting private commitment lineage/,
  );
});

test("spendability probes the current replacement nullifier and fails closed", async () => {
  const current = details({
    id: "00000000-0000-4000-8000-000000000006",
    balanceWei: 750n,
    withdrawalIndex: 1n,
  });
  const expected = derivePrivacyPoolCommitment(
    750n,
    LABEL,
    derivePrivacyPoolWithdrawalSecrets(masterKeys, LABEL, 0n),
  );
  let observed: bigint | null = null;
  await assertPrivacyCommitmentSpendable({ commitment: current, masterKeys }, {
    isPrivacyNullifierSpent: async (nullifier) => {
      observed = nullifier;
      return false;
    },
  });
  assert.equal(observed, expected.nullifierHash);

  await assert.rejects(
    assertPrivacyCommitmentSpendable({ commitment: current, masterKeys }, {
      isPrivacyNullifierSpent: async () => true,
    }),
    (error: unknown) =>
      error instanceof PrivacyCommitmentSpendabilityError &&
      error.code === "already-spent",
  );
  await assert.rejects(
    assertPrivacyCommitmentSpendable({ commitment: current, masterKeys }, {
      isPrivacyNullifierSpent: async () => {
        throw new Error("rpc unavailable");
      },
    }),
    (error: unknown) =>
      error instanceof PrivacyCommitmentSpendabilityError &&
      error.code === "unavailable",
  );
});
