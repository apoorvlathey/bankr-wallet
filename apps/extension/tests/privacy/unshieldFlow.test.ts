import assert from "node:assert/strict";
import test from "node:test";

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
  decryptPrivacyUnshieldDetails,
  encryptPrivacyUnshieldDetails,
} from "../../src/chrome/privacy/withdrawals/crypto";
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
    PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope,
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
      scope: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope.toString(),
      poolAddress: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
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
      asset: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.nativeAsset,
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
