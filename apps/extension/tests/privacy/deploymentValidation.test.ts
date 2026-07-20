import assert from "node:assert/strict";
import test from "node:test";

import {
  PRIVACY_POOLS_RELEASE_POLICY,
  PRIVACY_POOLS_SEPOLIA_DEPLOYMENT,
  type PrivacyPoolsContractId,
} from "../../src/chrome/privacy/deployment/manifest";
import {
  assertPrivacyPoolsSepoliaSnapshot,
  PrivacyDeploymentVerificationError,
  type PrivacyPoolsSepoliaSnapshot,
} from "../../src/chrome/privacy/deployment/validation";

function validSnapshot(): PrivacyPoolsSepoliaSnapshot {
  const deployment = PRIVACY_POOLS_SEPOLIA_DEPLOYMENT;
  const contracts = Object.fromEntries(
    (Object.keys(deployment.contracts) as PrivacyPoolsContractId[]).map((id) => [
      id,
      {
        runtimeByteLength: deployment.contracts[id].runtimeByteLength,
        runtimeBytecodeHash: deployment.contracts[id].runtimeBytecodeHash,
      },
    ]),
  ) as PrivacyPoolsSepoliaSnapshot["contracts"];

  return {
    chainId: deployment.chainId,
    implementationSlot:
      "0x000000000000000000000000457f219308fd4f06ffb39dc7b532a51b1580f58b",
    contracts,
    pool: {
      scope: deployment.scope,
      entrypoint: deployment.contracts.entrypointProxy.address,
      asset: deployment.nativeAsset,
      withdrawalVerifier: deployment.contracts.withdrawalVerifier.address,
      ragequitVerifier: deployment.contracts.ragequitVerifier.address,
    },
    entrypoint: {
      poolForScope: deployment.contracts.ethPool.address,
      assetPool: deployment.contracts.ethPool.address,
      minimumDepositAmount: deployment.assetConfig.minimumDepositAmount,
      vettingFeeBPS: deployment.assetConfig.vettingFeeBPS,
      maxRelayFeeBPS: deployment.assetConfig.maxRelayFeeBPS,
    },
  };
}

function isMismatch(error: unknown): boolean {
  return (
    error instanceof PrivacyDeploymentVerificationError &&
    error.code === "deployment-mismatch" &&
    error.message === "deployment-mismatch"
  );
}

test("Sepolia release pins enable only the pinned local beta and remain mainnet-free", () => {
  assert.equal(PRIVACY_POOLS_RELEASE_POLICY.mode, "sepolia-local-beta");
  assert.equal(PRIVACY_POOLS_RELEASE_POLICY.readiness, "enabled");
  assert.equal(PRIVACY_POOLS_RELEASE_POLICY.quotes, "enabled");
  assert.equal(PRIVACY_POOLS_RELEASE_POLICY.mutations, "sepolia-enabled");
  assert.equal(PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.chainId, 11_155_111);
  assert.equal(
    PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.source.commit,
    "461867adb439f25f1cc809ee0187357916b90ef6",
  );
  assert.equal(Object.isFrozen(PRIVACY_POOLS_RELEASE_POLICY), true);
  assert.equal(Object.isFrozen(PRIVACY_POOLS_SEPOLIA_DEPLOYMENT), true);
  assert.equal(Object.isFrozen(PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts), true);
  assert.doesNotMatch(
    JSON.stringify(PRIVACY_POOLS_SEPOLIA_DEPLOYMENT, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
    /6818809eefce719e480a7526d76bd3e561526b46/i,
  );
});

test("the exact verified Sepolia snapshot passes", () => {
  assert.doesNotThrow(() => assertPrivacyPoolsSepoliaSnapshot(validSnapshot()));
});

test("chain, proxy, bytecode, pool, verifier, scope, and fee drift fail closed", () => {
  const mutations: Array<(snapshot: PrivacyPoolsSepoliaSnapshot) => void> = [
    (snapshot) => {
      snapshot.chainId = 1;
    },
    (snapshot) => {
      snapshot.implementationSlot = `0x${"0".repeat(64)}`;
    },
    (snapshot) => {
      snapshot.contracts.ethPool.runtimeBytecodeHash = `0x${"0".repeat(64)}`;
    },
    (snapshot) => {
      snapshot.contracts.withdrawalVerifier.runtimeByteLength = 0;
    },
    (snapshot) => {
      snapshot.pool.scope = 0n;
    },
    (snapshot) => {
      snapshot.pool.entrypoint = "0x0000000000000000000000000000000000000000";
    },
    (snapshot) => {
      snapshot.pool.asset = "0x0000000000000000000000000000000000000000";
    },
    (snapshot) => {
      snapshot.pool.ragequitVerifier =
        "0x0000000000000000000000000000000000000000";
    },
    (snapshot) => {
      snapshot.entrypoint.poolForScope =
        "0x0000000000000000000000000000000000000000";
    },
    (snapshot) => {
      snapshot.entrypoint.assetPool =
        "0x0000000000000000000000000000000000000000";
    },
    (snapshot) => {
      snapshot.entrypoint.minimumDepositAmount = 0n;
    },
    (snapshot) => {
      snapshot.entrypoint.vettingFeeBPS = 0n;
    },
    (snapshot) => {
      snapshot.entrypoint.maxRelayFeeBPS = 0n;
    },
  ];

  for (const mutate of mutations) {
    const snapshot = validSnapshot();
    mutate(snapshot);
    assert.throws(() => assertPrivacyPoolsSepoliaSnapshot(snapshot), isMismatch);
  }
});

test("malformed EIP-1967 words and code hashes are rejected", () => {
  for (const implementationSlot of [
    null,
    "0x1234",
    `0x01${"0".repeat(62)}`,
  ]) {
    const snapshot = validSnapshot();
    snapshot.implementationSlot = implementationSlot;
    assert.throws(() => assertPrivacyPoolsSepoliaSnapshot(snapshot), isMismatch);
  }

  for (const runtimeBytecodeHash of [null, "", "0x1234", `0x${"A".repeat(64)}`]) {
    const snapshot = validSnapshot();
    snapshot.contracts.entrypointProxy.runtimeBytecodeHash = runtimeBytecodeHash;
    assert.throws(() => assertPrivacyPoolsSepoliaSnapshot(snapshot), isMismatch);
  }
});
