import {
  PRIVACY_POOLS_RELEASE_POLICY,
  PRIVACY_POOLS_DEPLOYMENT,
  type PrivacyPoolsContractId,
  type PrivacyPoolsDeployment,
  type PrivacyPoolsReleasePolicy,
} from "./manifest";

export type PrivacyDeploymentFailureCode =
  | "release-disabled"
  | "rpc-unavailable"
  | "deployment-mismatch";

export class PrivacyDeploymentVerificationError extends Error {
  readonly code: PrivacyDeploymentFailureCode;

  constructor(code: PrivacyDeploymentFailureCode) {
    super(code);
    this.name = "PrivacyDeploymentVerificationError";
    this.code = code;
  }
}

export interface PrivacyPoolsRuntimeIdentity {
  runtimeByteLength: unknown;
  runtimeBytecodeHash: unknown;
}

export interface PrivacyPoolsSnapshot {
  chainId: unknown;
  implementationSlot: unknown;
  contracts: Record<PrivacyPoolsContractId, PrivacyPoolsRuntimeIdentity>;
  pool: {
    scope: unknown;
    entrypoint: unknown;
    asset: unknown;
    withdrawalVerifier: unknown;
    ragequitVerifier: unknown;
  };
  entrypoint: {
    poolForScope: unknown;
    assetPool: unknown;
    minimumDepositAmount: unknown;
    vettingFeeBPS: unknown;
    maxRelayFeeBPS: unknown;
  };
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const STORAGE_WORD_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const BYTECODE_HASH_PATTERN = /^0x[0-9a-f]{64}$/;

function addressMatches(actual: unknown, expected: string): boolean {
  return (
    typeof actual === "string" &&
    ADDRESS_PATTERN.test(actual) &&
    actual.toLowerCase() === expected.toLowerCase()
  );
}

function implementationFromSlot(slot: unknown): string | null {
  if (typeof slot !== "string" || !STORAGE_WORD_PATTERN.test(slot)) return null;
  const body = slot.slice(2);
  if (body.slice(0, 24) !== "0".repeat(24)) return null;
  const implementation = `0x${body.slice(24)}`;
  return ADDRESS_PATTERN.test(implementation) ? implementation : null;
}

function mismatch(): never {
  throw new PrivacyDeploymentVerificationError("deployment-mismatch");
}

/** Fail closed unless every pinned address, relationship, and code identity matches. */
export function assertPrivacyPoolsSnapshot(
  snapshot: PrivacyPoolsSnapshot,
  deployment: PrivacyPoolsDeployment = PRIVACY_POOLS_DEPLOYMENT,
  releasePolicy: PrivacyPoolsReleasePolicy = PRIVACY_POOLS_RELEASE_POLICY,
): void {
  if (
    releasePolicy.deploymentProfile !== deployment.profile ||
    releasePolicy.readiness !== "enabled" ||
    releasePolicy.quotes !== "enabled" ||
    releasePolicy.operationPreparation !== "enabled" ||
    releasePolicy.mutations !== "enabled"
  ) {
    throw new PrivacyDeploymentVerificationError("release-disabled");
  }

  if (snapshot.chainId !== deployment.chainId) mismatch();

  const implementation = implementationFromSlot(snapshot.implementationSlot);
  if (
    !addressMatches(
      implementation,
      deployment.contracts.entrypointImplementation.address,
    )
  ) {
    mismatch();
  }

  for (const id of Object.keys(deployment.contracts) as PrivacyPoolsContractId[]) {
    const actual = snapshot.contracts[id];
    const expected = deployment.contracts[id];
    if (
      !actual ||
      actual.runtimeByteLength !== expected.runtimeByteLength ||
      typeof actual.runtimeBytecodeHash !== "string" ||
      !BYTECODE_HASH_PATTERN.test(actual.runtimeBytecodeHash) ||
      actual.runtimeBytecodeHash !== expected.runtimeBytecodeHash
    ) {
      mismatch();
    }
  }

  if (
    snapshot.pool.scope !== deployment.scope ||
    !addressMatches(
      snapshot.pool.entrypoint,
      deployment.contracts.entrypointProxy.address,
    ) ||
    !addressMatches(snapshot.pool.asset, deployment.nativeAsset) ||
    !addressMatches(
      snapshot.pool.withdrawalVerifier,
      deployment.contracts.withdrawalVerifier.address,
    ) ||
    !addressMatches(
      snapshot.pool.ragequitVerifier,
      deployment.contracts.ragequitVerifier.address,
    ) ||
    !addressMatches(
      snapshot.entrypoint.poolForScope,
      deployment.contracts.ethPool.address,
    ) ||
    !addressMatches(
      snapshot.entrypoint.assetPool,
      deployment.contracts.ethPool.address,
    ) ||
    snapshot.entrypoint.minimumDepositAmount !==
      deployment.assetConfig.minimumDepositAmount ||
    snapshot.entrypoint.vettingFeeBPS !== deployment.assetConfig.vettingFeeBPS ||
    snapshot.entrypoint.maxRelayFeeBPS !==
      deployment.assetConfig.maxRelayFeeBPS
  ) {
    mismatch();
  }
}
