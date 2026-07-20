import assert from "node:assert/strict";
import test from "node:test";

import { generateVaultKey, importVaultKey } from "../../src/chrome/crypto";
import {
  decryptPrivacyCommitmentDetails,
  encryptPrivacyCommitmentDetails,
} from "../../src/chrome/privacy/commitments/crypto";
import {
  recoverPrivacyCommitmentsFromEvents,
} from "../../src/chrome/privacy/commitments/rescan";
import {
  isValidPrivacyCommitmentDetails,
  isValidStoredPrivacyCommitment,
  type PrivacyCommitmentDetailsV1,
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
const ID = "00000000-0000-4000-8000-000000000001";
const DEPOSITOR = "0x1111111111111111111111111111111111111111" as const;
const TX_HASH = `0x${"22".repeat(32)}` as const;
const BLOCK_HASH = `0x${"33".repeat(32)}` as const;

function details(): PrivacyCommitmentDetailsV1 {
  return {
    version: 1,
    id: ID,
    chainId: 11_155_111,
    scope: PRIVACY_POOLS_DEPLOYMENT.scope.toString(),
    poolAddress: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
    commitment: "123",
    label: "456",
    valueWei: "99000",
    balanceWei: "99000",
    precommitment: "789",
    depositIndex: "7",
    depositor: DEPOSITOR,
    depositTxHash: TX_HASH,
    depositBlockNumber: "100",
    withdrawalIndex: "0",
    status: "awaiting_asp",
    sourceOperationId: null,
  };
}

test("private commitment details are encrypted with revision-bound AAD", async () => {
  const key = await importVaultKey(generateVaultKey());
  const header = {
    version: 1 as const,
    id: ID,
    keyId: "privacy-key-1",
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  const encryptedDetails = await encryptPrivacyCommitmentDetails(
    key,
    header,
    details(),
  );
  const record = { ...header, encryptedDetails };
  assert.equal(isValidStoredPrivacyCommitment(record), true);
  assert.deepEqual(await decryptPrivacyCommitmentDetails(key, record), details());
  assert.equal(
    await decryptPrivacyCommitmentDetails(key, { ...record, revision: 1 }),
    null,
  );
  assert.equal(
    isValidPrivacyCommitmentDetails({ ...details(), nullifier: "secret" }),
    false,
  );
});

test("phrase rescan finds a sparse WalletChan deposit and verifies its commitment", async () => {
  const masterKeys = derivePrivacyPoolMasterKeys(PHRASE);
  const index = 5n;
  const secrets = derivePrivacyPoolDepositSecrets(
    masterKeys,
    PRIVACY_POOLS_DEPLOYMENT.scope,
    index,
  );
  const precommitment = derivePrivacyPoolDepositPrecommitment(secrets);
  const commitment = derivePrivacyPoolCommitment(99_000n, 456n, secrets);
  const recovered = await recoverPrivacyCommitmentsFromEvents({
    masterKeys,
    events: [{
      version: 1,
      id: `${TX_HASH}:0`,
      chainId: 11_155_111,
      blockNumber: "100",
      blockHash: BLOCK_HASH,
      logIndex: 0,
      transactionHash: TX_HASH,
      depositor: DEPOSITOR,
      commitment: commitment.hash.toString(),
      label: "456",
      valueWei: "99000",
      precommitment: precommitment.toString(),
    }],
    createId: () => ID,
    maxIndex: 20,
    missGap: 8,
  });
  assert.equal(recovered.commitments.length, 1);
  assert.equal(recovered.commitments[0].depositIndex, "5");
  assert.equal(recovered.commitments[0].precommitment, precommitment.toString());
  assert.equal(recovered.commitments[0].commitment, commitment.hash.toString());
  assert.equal(recovered.nextDepositIndex, 6);
  assert.equal(recovered.scannedIndices, 14);
});

test("phrase rescan fails on a matching precommitment with altered commitment", async () => {
  const masterKeys = derivePrivacyPoolMasterKeys(PHRASE);
  const secrets = derivePrivacyPoolDepositSecrets(
    masterKeys,
    PRIVACY_POOLS_DEPLOYMENT.scope,
    0n,
  );
  const precommitment = derivePrivacyPoolDepositPrecommitment(secrets);
  await assert.rejects(() => recoverPrivacyCommitmentsFromEvents({
    masterKeys,
    events: [{
      version: 1,
      id: `${TX_HASH}:0`,
      chainId: 11_155_111,
      blockNumber: "100",
      blockHash: BLOCK_HASH,
      logIndex: 0,
      transactionHash: TX_HASH,
      depositor: DEPOSITOR,
      commitment: "123",
      label: "456",
      valueWei: "99000",
      precommitment: precommitment.toString(),
    }],
    createId: () => ID,
    maxIndex: 2,
    missGap: 2,
  }), /does not match/);
});

test("phrase rescan follows partial withdrawals to the active replacement commitment", async () => {
  const masterKeys = derivePrivacyPoolMasterKeys(PHRASE);
  const depositSecrets = derivePrivacyPoolDepositSecrets(
    masterKeys,
    PRIVACY_POOLS_DEPLOYMENT.scope,
    0n,
  );
  const precommitment = derivePrivacyPoolDepositPrecommitment(depositSecrets);
  const deposit = derivePrivacyPoolCommitment(99_000n, 456n, depositSecrets);
  const replacementSecrets = derivePrivacyPoolWithdrawalSecrets(masterKeys, 456n, 0n);
  const replacement = derivePrivacyPoolCommitment(60_000n, 456n, replacementSecrets);
  const recovered = await recoverPrivacyCommitmentsFromEvents({
    masterKeys,
    events: [{
      version: 1,
      id: `${TX_HASH}:0`,
      chainId: 11_155_111,
      blockNumber: "100",
      blockHash: BLOCK_HASH,
      logIndex: 0,
      transactionHash: TX_HASH,
      depositor: DEPOSITOR,
      commitment: deposit.hash.toString(),
      label: "456",
      valueWei: "99000",
      precommitment: precommitment.toString(),
    }],
    withdrawals: [{
      version: 1,
      id: `0x${"44".repeat(32)}:1`,
      chainId: 11_155_111,
      blockNumber: "110",
      blockHash: `0x${"55".repeat(32)}`,
      logIndex: 1,
      transactionHash: `0x${"44".repeat(32)}`,
      processooor: PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
      valueWei: "39000",
      spentNullifier: deposit.nullifierHash.toString(),
      newCommitment: replacement.hash.toString(),
    }],
    createId: () => ID,
    maxIndex: 2,
    missGap: 2,
  });
  assert.equal(recovered.commitments[0].commitment, replacement.hash.toString());
  assert.equal(recovered.commitments[0].balanceWei, "60000");
  assert.equal(recovered.commitments[0].valueWei, "99000");
  assert.equal(recovered.commitments[0].withdrawalIndex, "1");
});

test("phrase rescan recognizes a public emergency exit after a partial withdrawal", async () => {
  const masterKeys = derivePrivacyPoolMasterKeys(PHRASE);
  const depositSecrets = derivePrivacyPoolDepositSecrets(
    masterKeys,
    PRIVACY_POOLS_DEPLOYMENT.scope,
    0n,
  );
  const precommitment = derivePrivacyPoolDepositPrecommitment(depositSecrets);
  const deposit = derivePrivacyPoolCommitment(99_000n, 456n, depositSecrets);
  const replacementSecrets = derivePrivacyPoolWithdrawalSecrets(masterKeys, 456n, 0n);
  const replacement = derivePrivacyPoolCommitment(60_000n, 456n, replacementSecrets);
  const withdrawalTx = `0x${"44".repeat(32)}` as const;
  const ragequitTx = `0x${"66".repeat(32)}` as const;
  const recovered = await recoverPrivacyCommitmentsFromEvents({
    masterKeys,
    events: [{
      version: 1,
      id: `${TX_HASH}:0`,
      chainId: 11_155_111,
      blockNumber: "100",
      blockHash: BLOCK_HASH,
      logIndex: 0,
      transactionHash: TX_HASH,
      depositor: DEPOSITOR,
      commitment: deposit.hash.toString(),
      label: "456",
      valueWei: "99000",
      precommitment: precommitment.toString(),
    }],
    withdrawals: [{
      version: 1,
      id: `${withdrawalTx}:1`,
      chainId: 11_155_111,
      blockNumber: "110",
      blockHash: `0x${"55".repeat(32)}`,
      logIndex: 1,
      transactionHash: withdrawalTx,
      processooor: PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
      valueWei: "39000",
      spentNullifier: deposit.nullifierHash.toString(),
      newCommitment: replacement.hash.toString(),
    }],
    ragequits: [{
      version: 1,
      id: `${ragequitTx}:0`,
      chainId: 11_155_111,
      blockNumber: "120",
      blockHash: `0x${"77".repeat(32)}`,
      logIndex: 0,
      transactionHash: ragequitTx,
      ragequitter: DEPOSITOR,
      commitment: replacement.hash.toString(),
      label: "456",
      valueWei: "60000",
    }],
    createId: () => ID,
    maxIndex: 2,
    missGap: 2,
  });
  assert.equal(recovered.commitments[0].balanceWei, "0");
  assert.equal(recovered.commitments[0].status, "ragequit_recovered");
  assert.equal(recovered.commitments[0].withdrawalIndex, "1");
});
