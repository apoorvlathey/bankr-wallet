import assert from "node:assert/strict";
import test from "node:test";

import { generateVaultKey, importVaultKey } from "../../src/chrome/crypto";
import { buildPrivacyShieldCommitment } from "../../src/chrome/privacy/commitments/materializeShield";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../../src/chrome/privacy/deployment/manifest";
import { encryptPrivacyShieldOperationDetails } from "../../src/chrome/privacy/operations/crypto";
import {
  privacyShieldOperationDedupeKey,
  type PrivacyShieldOperationSummaryV1,
  type PrivacyShieldOperationTrackingV1,
} from "../../src/chrome/privacy/operations/types";
import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositPrecommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolMasterKeys,
} from "../../src/chrome/privacy/protocol/primitives";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OPERATION_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;

test("an indexed ASP-pending Shield deposit materializes its encrypted public-exit commitment", async () => {
  const masterKeys = derivePrivacyPoolMasterKeys(PHRASE);
  const secrets = derivePrivacyPoolDepositSecrets(
    masterKeys,
    PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope,
    7n,
  );
  const precommitment = derivePrivacyPoolDepositPrecommitment(secrets);
  const commitment = derivePrivacyPoolCommitment(99_000n, 456n, secrets);
  const summary: PrivacyShieldOperationSummaryV1 = {
    schema: "walletchan-privacy-shield-operation-v1",
    id: OPERATION_ID,
    requestId: "00000000-0000-4000-8000-000000000002",
    revision: 0,
    state: "awaiting_wallet_confirmation",
    createdAt: 1,
    updatedAt: 1,
    chainId: 11_155_111,
    accountId: "pk-1",
    accountAddress: ACCOUNT,
    accountType: "privateKey",
    amountWei: "100000",
    protocolFeeWei: "1000",
    shieldedAmountWei: "99000",
    gasReserveWei: "200",
    totalRequiredWei: "100200",
    destinationAddress:
      PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.entrypointProxy.address,
    poolAddress: PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address,
    dedupeKey: privacyShieldOperationDedupeKey({
      chainId: 11_155_111,
      accountId: "pk-1",
      amountWei: "100000",
    }),
  };
  const key = await importVaultKey(generateVaultKey());
  const keyId = "privacy-key-1";
  const encryptedDetails = await encryptPrivacyShieldOperationDetails(
    key,
    keyId,
    summary,
    {
      version: 1,
      operationId: OPERATION_ID,
      depositIndex: "7",
      precommitment: precommitment.toString(),
      callData: `0xb6b55f25${precommitment.toString(16).padStart(64, "0")}`,
    },
  );
  const tracking: PrivacyShieldOperationTrackingV1 = {
    version: 1,
    revision: 4,
    state: "awaiting_asp",
    updatedAt: 5,
    txHash: `0x${"22".repeat(32)}`,
    blockNumber: "100",
    commitment: commitment.hash.toString(),
    label: "456",
    poolValueWei: "99000",
    errorCode: null,
  };
  const built = await buildPrivacyShieldCommitment({
    material: { key, keyId, masterKeys },
    operation: { summary, keyId, encryptedDetails, tracking },
    tracking,
    status: "awaiting_asp",
  });

  assert.ok(built);
  assert.equal(built.commitment.status, "awaiting_asp");
  assert.equal(built.commitment.commitment, commitment.hash.toString());
  assert.equal(built.commitment.precommitment, precommitment.toString());
  assert.equal(built.commitment.depositor, ACCOUNT);
  assert.equal(built.commitment.sourceOperationId, OPERATION_ID);
  assert.equal(JSON.stringify(built).includes(secrets.secret.toString()), false);

  await assert.rejects(() => buildPrivacyShieldCommitment({
    material: { key, keyId, masterKeys },
    operation: { summary, keyId, encryptedDetails, tracking },
    tracking: { ...tracking, commitment: (commitment.hash + 1n).toString() },
    status: "awaiting_asp",
  }), /lineage does not match/);
});
