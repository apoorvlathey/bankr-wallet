import assert from "node:assert/strict";
import test from "node:test";

import { generateMerkleProof } from "@0xbow/privacy-pools-core-sdk";

import {
  fetchPrivacyAspDepositsByLabel,
} from "../../src/chrome/privacy/asp/client";
import { nextPrivacyCommitmentAspStatus } from "../../src/chrome/privacy/asp/commitmentEligibility";
import { verifyPrivacyAspMembership } from "../../src/chrome/privacy/asp/eligibility";
import {
  MAX_PRIVACY_ASP_LEAVES_PER_TREE,
  parsePrivacyAspDeposits,
  parsePrivacyAspLeaves,
  parsePrivacyAspRoots,
} from "../../src/chrome/privacy/asp/types";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../../src/chrome/privacy/deployment/manifest";
import { isPrivacyCommitmentPubliclyRecoverableStatus } from "../../src/chrome/privacy/commitments/types";
import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositPrecommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolMasterKeys,
} from "../../src/chrome/privacy/protocol/primitives";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const TX_HASH = `0x${"22".repeat(32)}`;
const PHRASE = "test test test test test test test test test test test junk";

function membershipFixture() {
  const masterKeys = derivePrivacyPoolMasterKeys(PHRASE);
  const depositIndex = 7n;
  const label = 456n;
  const value = 99_000n;
  const secrets = derivePrivacyPoolDepositSecrets(
    masterKeys,
    PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope,
    depositIndex,
  );
  const precommitment = derivePrivacyPoolDepositPrecommitment(secrets);
  const commitment = derivePrivacyPoolCommitment(value, label, secrets);
  const aspLeaves = [12n, label, 34n];
  const stateTreeLeaves = [78n, commitment.hash, 90n];
  const associationRoot = generateMerkleProof(aspLeaves, label).root;
  const stateRoot = generateMerkleProof(stateTreeLeaves, commitment.hash).root;
  const summary = {
    id: "00000000-0000-4000-8000-000000000001",
    accountAddress: ACCOUNT,
  };
  const tracking = {
    version: 1 as const,
    revision: 1,
    state: "awaiting_asp" as const,
    updatedAt: 2,
    txHash: TX_HASH,
    blockNumber: "100",
    commitment: commitment.hash.toString(),
    label: label.toString(),
    poolValueWei: value.toString(),
    errorCode: null,
  };
  const operation = {
    summary,
    encryptedDetails: {},
    keyId: "key-1",
    tracking,
  } as any;
  const details = {
    version: 1 as const,
    operationId: summary.id,
    depositIndex: depositIndex.toString(),
    precommitment: precommitment.toString(),
    callData: `0x${"00".repeat(36)}` as const,
  };
  const deposit = {
    type: "deposit" as const,
    amount: value.toString(),
    address: ACCOUNT as `0x${string}`,
    label: label.toString(),
    txHash: TX_HASH as `0x${string}`,
    timestamp: 1,
    precommitmentHash: precommitment.toString(),
    reviewStatus: "approved" as const,
  };
  return {
    operation,
    tracking,
    details,
    deposit,
    roots: {
      mtRoot: associationRoot.toString(),
      createdAt: "2026-07-17T14:09:02.002Z",
      onchainMtRoot: stateRoot.toString(),
    },
    leaves: {
      aspLeaves: aspLeaves.map(String),
      stateTreeLeaves: stateTreeLeaves.map(String),
    },
    onchain: {
      associationRoot,
      stateRoot,
      associationTimestamp: 1n,
    },
    masterKeys,
  };
}

test("ASP codecs accept the live shape and reject drift, duplicates, and oversized trees", () => {
  assert.deepEqual(parsePrivacyAspRoots({
    mtRoot: "1",
    createdAt: "2026-07-17T14:09:02.002Z",
    onchainMtRoot: "2",
  }), {
    mtRoot: "1",
    createdAt: "2026-07-17T14:09:02.002Z",
    onchainMtRoot: "2",
  });
  assert.throws(() => parsePrivacyAspRoots({
    mtRoot: "1",
    createdAt: "2026-07-17T14:09:02.002Z",
    onchainMtRoot: "2",
    injected: true,
  }));
  assert.throws(() => parsePrivacyAspLeaves({
    aspLeaves: ["1", "1"],
    stateTreeLeaves: ["2"],
  }));
  assert.throws(() => parsePrivacyAspLeaves({
    aspLeaves: Array(MAX_PRIVACY_ASP_LEAVES_PER_TREE + 1).fill("1"),
    stateTreeLeaves: ["2"],
  }));
  assert.throws(() => parsePrivacyAspDeposits([{
    type: "deposit",
    amount: "1",
    address: ACCOUNT,
    label: "2",
    txHash: TX_HASH,
    timestamp: 1,
    precommitmentHash: "3",
    reviewStatus: "made_up",
  }]));
});

test("approved membership requires local lineage plus ASP and state roots pinned onchain", () => {
  const fixture = membershipFixture();
  assert.doesNotThrow(() => verifyPrivacyAspMembership(fixture));
  assert.throws(
    () => verifyPrivacyAspMembership({
      ...fixture,
      roots: {
        ...fixture.roots,
        mtRoot: fixture.roots.onchainMtRoot,
        onchainMtRoot: fixture.roots.mtRoot,
      },
    }),
    /roots do not match Sepolia/,
  );
  assert.throws(
    () => verifyPrivacyAspMembership({
      ...fixture,
      leaves: { ...fixture.leaves, aspLeaves: ["12", "34"] },
    }),
    /Leaf not found/,
  );
  assert.throws(
    () => verifyPrivacyAspMembership({
      ...fixture,
      deposit: { ...fixture.deposit, precommitmentHash: "999" },
    }),
    /does not match/,
  );
});

test("ASP client sends only the requested labels and rejects response injection", async () => {
  const originalFetch = globalThis.fetch;
  let observedHeaders: Headers | null = null;
  globalThis.fetch = (async (_input, init) => {
    observedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify([{
      type: "deposit",
      amount: "100",
      address: ACCOUNT,
      label: "8",
      txHash: TX_HASH,
      timestamp: 1,
      precommitmentHash: "9",
      reviewStatus: "pending",
    }]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await assert.rejects(() => fetchPrivacyAspDepositsByLabel(["7"]));
    assert.equal(observedHeaders?.get("X-Labels"), "7");
    assert.equal(
      observedHeaders?.get("X-Pool-Scope"),
      PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope.toString(),
    );
    assert.equal(observedHeaders?.has("Authorization"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ASP waiting and outage states preserve explicit public recovery", () => {
  assert.equal(isPrivacyCommitmentPubliclyRecoverableStatus("awaiting_asp"), true);
  assert.equal(isPrivacyCommitmentPubliclyRecoverableStatus("asp_unavailable"), true);
  assert.equal(isPrivacyCommitmentPubliclyRecoverableStatus("private_ready"), false);
  assert.equal(
    nextPrivacyCommitmentAspStatus("asp_unavailable", "approved"),
    "private_ready",
  );
  assert.equal(
    nextPrivacyCommitmentAspStatus("asp_unavailable", "pending"),
    "awaiting_asp",
  );
  assert.equal(
    nextPrivacyCommitmentAspStatus("private_ready", "pending"),
    "private_ready",
  );
});
