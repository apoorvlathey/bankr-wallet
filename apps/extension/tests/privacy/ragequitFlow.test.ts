import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
} from "viem";

import { generateVaultKey, importVaultKey } from "../../src/chrome/crypto";
import type { PrivacyCommitmentDetailsV1 } from "../../src/chrome/privacy/commitments/types";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../../src/chrome/privacy/deployment/manifest";
import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositPrecommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolMasterKeys,
  derivePrivacyPoolWithdrawalSecrets,
} from "../../src/chrome/privacy/protocol/primitives";
import {
  decryptPrivacyRagequitDetails,
  encryptPrivacyRagequitDetails,
} from "../../src/chrome/privacy/ragequit/crypto";
import { decodePrivacyRagequitReceiptEvent } from "../../src/chrome/privacy/ragequit/lifecycle";
import {
  encodePrivacyRagequitCallData,
  PRIVACY_RAGEQUIT_ABI,
} from "../../src/chrome/privacy/ragequit/prepare";
import {
  defaultPrivacyRagequitTracking,
  isValidStoredPrivacyRagequit,
  type PrivacyRagequitDetailsV1,
  type PrivacyRagequitSummaryV1,
} from "../../src/chrome/privacy/ragequit/types";
import { derivePrivacyCurrentCommitmentSecrets } from "../../src/chrome/privacy/withdrawals/lineage";

const PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OPERATION_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "00000000-0000-4000-8000-000000000002";
const COMMITMENT_ID = "00000000-0000-4000-8000-000000000003";
const DEPOSITOR = "0x1111111111111111111111111111111111111111" as const;

function currentCommitment(): PrivacyCommitmentDetailsV1 {
  const keys = derivePrivacyPoolMasterKeys(PHRASE);
  const depositSecrets = derivePrivacyPoolDepositSecrets(
    keys,
    PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope,
    3n,
  );
  const label = 456n;
  const currentSecrets = derivePrivacyPoolWithdrawalSecrets(keys, label, 0n);
  const current = derivePrivacyPoolCommitment(600n, label, currentSecrets);
  return {
    version: 1,
    id: COMMITMENT_ID,
    chainId: 11_155_111,
    scope: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope.toString(),
    poolAddress: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
    commitment: current.hash.toString(),
    label: label.toString(),
    valueWei: "1000",
    balanceWei: "600",
    precommitment: derivePrivacyPoolDepositPrecommitment(depositSecrets).toString(),
    depositIndex: "3",
    depositor: DEPOSITOR,
    depositTxHash: `0x${"33".repeat(32)}`,
    depositBlockNumber: "100",
    withdrawalIndex: "1",
    status: "asp_declined",
    sourceOperationId: null,
  };
}

test("public recovery follows the current partial-withdrawal lineage and encodes Solidity proof order", () => {
  const details = currentCommitment();
  const keys = derivePrivacyPoolMasterKeys(PHRASE);
  const secrets = derivePrivacyCurrentCommitmentSecrets({ commitment: details, masterKeys: keys });
  const current = derivePrivacyPoolCommitment(
    BigInt(details.balanceWei),
    BigInt(details.label),
    secrets,
  );
  assert.equal(current.hash.toString(), details.commitment);

  const proof = {
    pi_a: ["1", "2", "1"] as const,
    pi_b: [["3", "4"], ["5", "6"], ["1", "0"]] as const,
    pi_c: ["7", "8", "1"] as const,
    protocol: "groth16" as const,
    curve: "bn128" as const,
  };
  const signals = [
    current.hash.toString(),
    current.nullifierHash.toString(),
    details.balanceWei,
    details.label,
  ] as const;
  const callData = encodePrivacyRagequitCallData({
    proof,
    publicSignals: signals,
    expected: signals,
  });
  const decoded = decodeFunctionData({ abi: PRIVACY_RAGEQUIT_ABI, data: callData });
  assert.equal(decoded.functionName, "ragequit");
  assert.deepEqual(decoded.args[0].pB, [[4n, 3n], [6n, 5n]]);
  assert.deepEqual(decoded.args[0].pubSignals, signals.map(BigInt));
  assert.throws(() => encodePrivacyRagequitCallData({
    proof,
    publicSignals: signals,
    expected: [signals[0], signals[1], "601", signals[3]],
  }));
});

test("public recovery intent is encrypted and summary-bound", async () => {
  const commitment = currentCommitment();
  const keys = derivePrivacyPoolMasterKeys(PHRASE);
  const secrets = derivePrivacyCurrentCommitmentSecrets({ commitment, masterKeys: keys });
  const current = derivePrivacyPoolCommitment(600n, 456n, secrets);
  const summary: PrivacyRagequitSummaryV1 = {
    schema: "walletchan-privacy-ragequit-v1",
    version: 1,
    id: OPERATION_ID,
    requestId: REQUEST_ID,
    createdAt: 1,
    chainId: 11_155_111,
    accountId: "pk-1",
    accountAddress: DEPOSITOR,
    accountType: "privateKey",
    amountWei: "600",
    poolAddress: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
  };
  const callData = encodePrivacyRagequitCallData({
    proof: {
      pi_a: ["1", "2", "1"],
      pi_b: [["3", "4"], ["5", "6"], ["1", "0"]],
      pi_c: ["7", "8", "1"],
      protocol: "groth16",
      curve: "bn128",
    },
    publicSignals: [current.hash.toString(), current.nullifierHash.toString(), "600", "456"],
    expected: [current.hash.toString(), current.nullifierHash.toString(), "600", "456"],
  });
  const details: PrivacyRagequitDetailsV1 = {
    version: 1,
    operationId: OPERATION_ID,
    commitmentId: COMMITMENT_ID,
    commitmentRevision: 2,
    commitmentHash: current.hash.toString(),
    label: "456",
    balanceWei: "600",
    nullifierHash: current.nullifierHash.toString(),
    previousStatus: "awaiting_asp",
    callData,
  };
  const key = await importVaultKey(generateVaultKey());
  const encryptedDetails = await encryptPrivacyRagequitDetails(key, "key-1", summary, details);
  const record = {
    summary,
    keyId: "key-1",
    encryptedDetails,
    tracking: defaultPrivacyRagequitTracking(summary),
  };
  assert.equal(isValidStoredPrivacyRagequit(record), true);
  assert.deepEqual(await decryptPrivacyRagequitDetails(key, record), details);
  assert.equal(await decryptPrivacyRagequitDetails(key, {
    ...record,
    summary: { ...summary, amountWei: "601" },
  }), null);
  assert.equal(JSON.stringify(record).includes(details.commitmentHash), false);
});

test("public recovery intent accepts the ASP-unavailable recovery reason", async () => {
  const commitment = currentCommitment();
  const keys = derivePrivacyPoolMasterKeys(PHRASE);
  const secrets = derivePrivacyCurrentCommitmentSecrets({ commitment, masterKeys: keys });
  const current = derivePrivacyPoolCommitment(600n, 456n, secrets);
  const summary: PrivacyRagequitSummaryV1 = {
    schema: "walletchan-privacy-ragequit-v1",
    version: 1,
    id: OPERATION_ID,
    requestId: REQUEST_ID,
    createdAt: 1,
    chainId: 11_155_111,
    accountId: "pk-1",
    accountAddress: DEPOSITOR,
    accountType: "privateKey",
    amountWei: "600",
    poolAddress: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
  };
  const details: PrivacyRagequitDetailsV1 = {
    version: 1,
    operationId: OPERATION_ID,
    commitmentId: COMMITMENT_ID,
    commitmentRevision: 2,
    commitmentHash: current.hash.toString(),
    label: "456",
    balanceWei: "600",
    nullifierHash: current.nullifierHash.toString(),
    previousStatus: "asp_unavailable",
    callData: encodePrivacyRagequitCallData({
      proof: {
        pi_a: ["1", "2", "1"],
        pi_b: [["3", "4"], ["5", "6"], ["1", "0"]],
        pi_c: ["7", "8", "1"],
        protocol: "groth16",
        curve: "bn128",
      },
      publicSignals: [current.hash.toString(), current.nullifierHash.toString(), "600", "456"],
      expected: [current.hash.toString(), current.nullifierHash.toString(), "600", "456"],
    }),
  };
  const key = await importVaultKey(generateVaultKey());
  const encryptedDetails = await encryptPrivacyRagequitDetails(key, "key-1", summary, details);
  assert.equal(isValidStoredPrivacyRagequit({
    summary,
    keyId: "key-1",
    encryptedDetails,
    tracking: defaultPrivacyRagequitTracking(summary),
  }), true);
});

test("receipt decoder accepts only the exact pinned ETH pool Ragequit event", () => {
  const abi = parseAbi([
    "event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)",
  ]);
  const log = {
    address: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
    topics: encodeEventTopics({
      abi,
      eventName: "Ragequit",
      args: { _ragequitter: DEPOSITOR },
    }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [123n, 456n, 600n],
    ),
  };
  assert.deepEqual(decodePrivacyRagequitReceiptEvent({ logs: [log] }), {
    ragequitter: DEPOSITOR,
    commitment: "123",
    label: "456",
    valueWei: "600",
  });
  assert.equal(decodePrivacyRagequitReceiptEvent({
    logs: [{ ...log, address: "0x2222222222222222222222222222222222222222" }],
  }), null);
});
