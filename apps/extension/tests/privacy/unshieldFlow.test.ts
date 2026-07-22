import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";

import { generateVaultKey, importVaultKey } from "../../src/chrome/crypto";
import type { PrivacyCommitmentDetailsV1 } from "../../src/chrome/privacy/commitments/types";
import {
  canApplyPrivacyCommitmentWithdrawal,
  matchesPrivacyCommitmentStatusGuard,
} from "../../src/chrome/privacy/commitments/repository";
import { PRIVACY_POOLS_DEPLOYMENT } from "../../src/chrome/privacy/deployment/manifest";
import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositPrecommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolMasterKeys,
  derivePrivacyPoolWithdrawalSecrets,
} from "../../src/chrome/privacy/protocol/primitives";
import {
  decryptPrivacyUnshieldDetails,
  encryptPrivacyUnshieldDetails,
} from "../../src/chrome/privacy/withdrawals/crypto";
import {
  decodePrivacyUnshieldReceiptEvent,
  getPrivacyDirectUnshieldFailureTracking,
  isAbandonedPrivacyDirectUnshieldConfirmation,
  isPrivacyUnshieldPublicEventMatch,
} from "../../src/chrome/privacy/withdrawals/lifecycle";
import { derivePrivacyWithdrawalLineage } from "../../src/chrome/privacy/withdrawals/lineage";
import {
  defaultPrivacyUnshieldTracking,
  isValidPrivacyUnshieldDetails,
  isValidStoredPrivacyUnshield,
  type PrivacyUnshieldDetailsV1,
  type PrivacyUnshieldSummaryV1,
} from "../../src/chrome/privacy/withdrawals/types";

const PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "00000000-0000-4000-8000-000000000002";
const COMMITMENT_ID = "00000000-0000-4000-8000-000000000003";
const DEPOSITOR = "0x1111111111111111111111111111111111111111" as const;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;

function commitment(): { details: PrivacyCommitmentDetailsV1; masterKeys: ReturnType<typeof derivePrivacyPoolMasterKeys> } {
  const masterKeys = derivePrivacyPoolMasterKeys(PHRASE);
  const secrets = derivePrivacyPoolDepositSecrets(
    masterKeys,
    PRIVACY_POOLS_DEPLOYMENT.scope,
    0n,
  );
  const precommitment = derivePrivacyPoolDepositPrecommitment(secrets);
  const value = 1_000_000_000_000_000_000n;
  const derived = derivePrivacyPoolCommitment(value, 456n, secrets);
  return {
    masterKeys,
    details: {
      version: 1,
      id: COMMITMENT_ID,
      chainId: 11_155_111,
      scope: PRIVACY_POOLS_DEPLOYMENT.scope.toString(),
      poolAddress: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
      commitment: derived.hash.toString(),
      label: "456",
      valueWei: value.toString(),
      balanceWei: value.toString(),
      precommitment: precommitment.toString(),
      depositIndex: "0",
      depositor: DEPOSITOR,
      depositTxHash: `0x${"33".repeat(32)}`,
      depositBlockNumber: "100",
      withdrawalIndex: "0",
      status: "private_ready",
      sourceOperationId: null,
    },
  };
}

function recordFixture() {
  const current = commitment();
  const amount = 400_000_000_000_000_000n;
  const lineage = derivePrivacyWithdrawalLineage({
    commitment: current.details,
    masterKeys: current.masterKeys,
    amountWei: amount,
  });
  const summary: PrivacyUnshieldSummaryV1 = {
    schema: "walletchan-privacy-unshield-v1",
    version: 1,
    id: ID,
    requestId: REQUEST_ID,
    createdAt: 1,
    chainId: 11_155_111,
    amountWei: amount.toString(),
    netRecipientAmountWei: "399600000000000000",
    relayFeeWei: "400000000000000",
    feeBPS: "10",
    recipient: RECIPIENT,
    relayerName: "Testnet Relay",
    expiresAt: 60_001,
    recipientMatchesDepositor: false,
  };
  const details: PrivacyUnshieldDetailsV1 = {
    version: 1,
    operationId: ID,
    commitmentId: COMMITMENT_ID,
    commitmentRevision: 0,
    commitmentHash: current.details.commitment,
    label: current.details.label,
    balanceWei: current.details.balanceWei,
    depositIndex: "0",
    withdrawalIndex: "0",
    expectedSpentNullifier: lineage.spentNullifier.toString(),
    expectedNewCommitment: lineage.newCommitment.toString(),
    expectedNewBalanceWei: lineage.newBalanceWei.toString(),
    expectedNewWithdrawalIndex: "1",
    relayerUrl: "https://testnet-relayer.privacypools.com",
    signerAddress: "0x696FE46495688fC9e99BAd2dAF2133B33de364eA",
    feeReceiverAddress: "0x349746Ab142B5d0D65899d9bcB6f2Cd53AB084d8",
    baseFeeBPS: "10",
    gasPrice: "1",
    relayGas: "650000",
    relayCostWei: "650000",
    feeCommitment: {
      expiration: 60_001,
      withdrawalData: `0x${"11".repeat(96)}`,
      asset: PRIVACY_POOLS_DEPLOYMENT.nativeAsset,
      amount: amount.toString(),
      extraGas: false,
      signedRelayerCommitment: `0x${"22".repeat(65)}`,
    },
  };
  return { current, lineage, summary, details };
}

test("full and partial Unshield lineage derive deterministic replacement commitments", () => {
  const current = commitment();
  const partial = derivePrivacyWithdrawalLineage({
    commitment: current.details,
    masterKeys: current.masterKeys,
    amountWei: 400_000_000_000_000_000n,
  });
  assert.equal(partial.newBalanceWei, 600_000_000_000_000_000n);
  const replacementSecrets = derivePrivacyPoolWithdrawalSecrets(current.masterKeys, 456n, 0n);
  assert.equal(
    partial.newCommitment,
    derivePrivacyPoolCommitment(600_000_000_000_000_000n, 456n, replacementSecrets).hash,
  );
  const full = derivePrivacyWithdrawalLineage({
    commitment: current.details,
    masterKeys: current.masterKeys,
    amountWei: 1_000_000_000_000_000_000n,
  });
  assert.equal(full.newBalanceWei, 0n);
  assert.notEqual(full.newCommitment, 0n);
});

test("verified Unshield can finalize after a released pending claim", () => {
  const { details } = commitment();
  const expected = {
    expectedRevision: 0,
    expectedCommitment: details.commitment,
    expectedBalanceWei: details.balanceWei,
    expectedWithdrawalIndex: details.withdrawalIndex,
  };
  assert.equal(canApplyPrivacyCommitmentWithdrawal(
    2,
    { ...details, status: "private_ready" },
    expected,
  ), true);
  assert.equal(canApplyPrivacyCommitmentWithdrawal(
    2,
    { ...details, commitment: (BigInt(details.commitment) + 1n).toString() },
    expected,
  ), false);
});

test("a stale ASP decision cannot overwrite a newer Unshield claim", () => {
  const reviewedSnapshot = {
    revision: 7,
    status: "private_ready" as const,
  };
  assert.equal(
    matchesPrivacyCommitmentStatusGuard(
      7,
      "private_ready",
      reviewedSnapshot,
    ),
    true,
  );
  assert.equal(
    matchesPrivacyCommitmentStatusGuard(
      8,
      "withdrawal_pending",
      reviewedSnapshot,
    ),
    false,
  );
});

test("Unshield intent details stay encrypted and AAD-bound", async () => {
  const fixture = recordFixture();
  assert.equal(isValidPrivacyUnshieldDetails(fixture.details, ID), true);
  const key = await importVaultKey(generateVaultKey());
  const encryptedDetails = await encryptPrivacyUnshieldDetails(
    key,
    "privacy-key",
    fixture.summary,
    fixture.details,
  );
  const record = {
    summary: fixture.summary,
    keyId: "privacy-key",
    encryptedDetails,
    tracking: defaultPrivacyUnshieldTracking(fixture.summary),
  };
  assert.equal(isValidStoredPrivacyUnshield(record), true);
  assert.deepEqual(await decryptPrivacyUnshieldDetails(key, record), fixture.details);
  assert.equal(
    await decryptPrivacyUnshieldDetails(key, {
      ...record,
      summary: { ...fixture.summary, recipient: DEPOSITOR },
    }),
    null,
  );
});

test("Unshield codecs reject injected secrets and inconsistent replacement indices", () => {
  const fixture = recordFixture();
  assert.equal(isValidPrivacyUnshieldDetails({ ...fixture.details, secret: "1" }), false);
  assert.equal(
    isValidPrivacyUnshieldDetails({ ...fixture.details, expectedNewWithdrawalIndex: "2" }),
    false,
  );
});

test("locked Unshield status binds the public receipt before confirmation", () => {
  const { summary } = recordFixture();
  const operation = { summary } as any;
  assert.equal(isPrivacyUnshieldPublicEventMatch(operation, {
    processooor: PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
    valueWei: summary.amountWei,
  }), true);
  assert.equal(isPrivacyUnshieldPublicEventMatch(operation, {
    processooor: DEPOSITOR,
    valueWei: summary.amountWei,
  }), false);
  assert.equal(isPrivacyUnshieldPublicEventMatch(operation, {
    processooor: PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
    valueWei: (BigInt(summary.amountWei) + 1n).toString(),
  }), false);
});

test("canonical Unshield receipt decoding accepts viem typed quantities", () => {
  const txHash = `0x${"55".repeat(32)}` as const;
  const [event] = parseAbi([
    "event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)",
  ]);
  const decoded = decodePrivacyUnshieldReceiptEvent({
    blockNumber: 123n,
    blockHash: `0x${"66".repeat(32)}`,
    logs: [{
      address: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
      logIndex: 0,
      topics: encodeEventTopics({
        abi: [event],
        eventName: "Withdrawn",
        args: { _processooor: RECIPIENT },
      }),
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [400n, 500n, 600n],
      ),
    }],
  }, txHash);

  assert.equal(decoded?.transactionHash, txHash);
  assert.equal(decoded?.blockNumber, "123");
  assert.equal(decoded?.logIndex, 0);
  assert.equal(decoded?.processooor.toLowerCase(), RECIPIENT.toLowerCase());
  assert.equal(decoded?.valueWei, "400");
  assert.equal(decoded?.spentNullifier, "500");
  assert.equal(decoded?.newCommitment, "600");
});

test("receiver-paid Unshield releases definite non-submissions but preserves ambiguous broadcasts", () => {
  const summary = recordFixture().summary;
  const awaiting = defaultPrivacyUnshieldTracking(
    { ...summary, method: "direct" } as any,
    "awaiting_wallet_confirmation",
  );
  const submissionUnknown = {
    ...awaiting,
    revision: awaiting.revision + 1,
    state: "submission_unknown" as const,
    errorCode: "submission-unknown",
  };

  const failedBeforeBroadcast = getPrivacyDirectUnshieldFailureTracking(awaiting, false);
  assert.equal(failedBeforeBroadcast?.state, "failed_recoverable");
  assert.equal(failedBeforeBroadcast?.errorCode, "submission-failed");

  const rejectedSubmission = getPrivacyDirectUnshieldFailureTracking(submissionUnknown, false);
  assert.equal(rejectedSubmission?.state, "failed_recoverable");
  assert.equal(rejectedSubmission?.errorCode, "submission-failed");

  assert.equal(
    getPrivacyDirectUnshieldFailureTracking(submissionUnknown, true),
    null,
  );
  assert.equal(
    getPrivacyDirectUnshieldFailureTracking({
      ...submissionUnknown,
      txHash: `0x${"44".repeat(32)}`,
    }, false),
    null,
  );
});

test("receiver-paid confirmation recovery cannot cancel the live submission handoff", () => {
  const summary = {
    ...recordFixture().summary,
    method: "direct" as const,
    expiresAt: 300_000,
  };
  const operation = {
    summary,
    tracking: defaultPrivacyUnshieldTracking(
      summary as any,
      "awaiting_wallet_confirmation",
    ),
  };

  assert.equal(
    isAbandonedPrivacyDirectUnshieldConfirmation(operation as any, false, 300_000),
    false,
  );
  assert.equal(
    isAbandonedPrivacyDirectUnshieldConfirmation(operation as any, false, 359_999),
    false,
  );
  assert.equal(
    isAbandonedPrivacyDirectUnshieldConfirmation(operation as any, true, 360_000),
    false,
  );
  assert.equal(
    isAbandonedPrivacyDirectUnshieldConfirmation(operation as any, false, 360_000),
    true,
  );
});
