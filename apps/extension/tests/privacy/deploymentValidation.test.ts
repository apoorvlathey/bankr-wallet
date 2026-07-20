import assert from "node:assert/strict";
import test from "node:test";

import {
  PRIVACY_POOLS_RELEASE_POLICY,
  PRIVACY_POOLS_DEPLOYMENT,
  PRIVACY_POOLS_MAINNET_DEPLOYMENT,
  PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
  type PrivacyPoolsContractId,
  type PrivacyPoolsDeployment,
} from "../../src/chrome/privacy/deployment/manifest";
import {
  assertPrivacyPoolsSnapshot,
  PrivacyDeploymentVerificationError,
  type PrivacyPoolsSnapshot,
} from "../../src/chrome/privacy/deployment/validation";

function validSnapshot(
  deployment: PrivacyPoolsDeployment = PRIVACY_POOLS_DEPLOYMENT,
): PrivacyPoolsSnapshot {
  const contracts = Object.fromEntries(
    (Object.keys(deployment.contracts) as PrivacyPoolsContractId[]).map((id) => [
      id,
      {
        runtimeByteLength: deployment.contracts[id].runtimeByteLength,
        runtimeBytecodeHash: deployment.contracts[id].runtimeBytecodeHash,
      },
    ]),
  ) as PrivacyPoolsSnapshot["contracts"];

  return {
    chainId: deployment.chainId,
    implementationSlot: `0x${"0".repeat(24)}${deployment.contracts.entrypointImplementation.address.slice(2).toLowerCase()}`,
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

test("direct test and development imports retain the pinned Sepolia local beta", () => {
  assert.equal(PRIVACY_POOLS_RELEASE_POLICY.mode, "sepolia-local-beta");
  assert.equal(PRIVACY_POOLS_RELEASE_POLICY.readiness, "enabled");
  assert.equal(PRIVACY_POOLS_RELEASE_POLICY.quotes, "enabled");
  assert.equal(PRIVACY_POOLS_RELEASE_POLICY.mutations, "enabled");
  assert.equal(PRIVACY_POOLS_RELEASE_POLICY.bankrMutations, "blocked");
  assert.equal(PRIVACY_POOLS_DEPLOYMENT.chainId, 11_155_111);
  assert.equal(
    PRIVACY_POOLS_DEPLOYMENT.source.commit,
    "461867adb439f25f1cc809ee0187357916b90ef6",
  );
  assert.equal(Object.isFrozen(PRIVACY_POOLS_RELEASE_POLICY), true);
  assert.equal(Object.isFrozen(PRIVACY_POOLS_DEPLOYMENT), true);
  assert.equal(Object.isFrozen(PRIVACY_POOLS_DEPLOYMENT.contracts), true);
  assert.doesNotMatch(
    JSON.stringify(PRIVACY_POOLS_DEPLOYMENT, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
    /6818809eefce719e480a7526d76bd3e561526b46/i,
  );
});

test("mainnet release pins the live proxy implementation and production services", () => {
  const deployment = PRIVACY_POOLS_MAINNET_DEPLOYMENT;
  assert.equal(PRIVACY_POOLS_MAINNET_RELEASE_POLICY.mode, "mainnet-production");
  assert.equal(PRIVACY_POOLS_MAINNET_RELEASE_POLICY.bankrMutations, "enabled");
  assert.equal(deployment.chainId, 1);
  assert.equal(deployment.chainName, "Ethereum");
  assert.equal(
    deployment.scope,
    4_916_574_638_117_198_869_413_701_114_161_172_350_986_437_430_914_933_850_166_949_084_132_905_299_523n,
  );
  assert.equal(deployment.assetConfig.minimumDepositAmount, 10_000_000_000_000_000n);
  assert.equal(deployment.assetConfig.vettingFeeBPS, 50n);
  assert.equal(deployment.assetConfig.maxRelayFeeBPS, 1_000n);
  assert.equal(
    deployment.contracts.entrypointImplementation.address,
    "0x15e355024de1CDc74ADdea7EBDf98418Ba5B1a2c",
  );
  assert.equal(deployment.services.aspBaseUrl, "https://api.0xbow.io");
  assert.deepEqual(
    deployment.services.relayers.map(({ name, url }) => ({ name, url })),
    [
      { name: "Fast Relay", url: "https://fastrelay.xyz" },
      { name: "Cloaked Relay", url: "https://api.clkd.xyz" },
    ],
  );
  assert.doesNotThrow(() =>
    assertPrivacyPoolsSnapshot(
      validSnapshot(deployment),
      deployment,
      PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
    )
  );
});

test("the exact verified Sepolia snapshot passes", () => {
  assert.doesNotThrow(() => assertPrivacyPoolsSnapshot(validSnapshot()));
});

test("chain, proxy, bytecode, pool, verifier, scope, and fee drift fail closed", () => {
  const mutations: Array<(snapshot: PrivacyPoolsSnapshot) => void> = [
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
    assert.throws(() => assertPrivacyPoolsSnapshot(snapshot), isMismatch);
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
    assert.throws(() => assertPrivacyPoolsSnapshot(snapshot), isMismatch);
  }

  for (const runtimeBytecodeHash of [null, "", "0x1234", `0x${"A".repeat(64)}`]) {
    const snapshot = validSnapshot();
    snapshot.contracts.entrypointProxy.runtimeBytecodeHash = runtimeBytecodeHash;
    assert.throws(() => assertPrivacyPoolsSnapshot(snapshot), isMismatch);
  }
});
