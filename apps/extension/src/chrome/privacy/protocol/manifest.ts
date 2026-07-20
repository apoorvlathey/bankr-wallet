import manifestSource from "../../../../privacy-pools.protocol.json";

export const PRIVACY_POOL_ARTIFACT_IDS = [
  "commitment-wasm",
  "commitment-vkey",
  "commitment-zkey",
  "withdraw-wasm",
  "withdraw-vkey",
  "withdraw-zkey",
] as const;

export type PrivacyPoolArtifactId =
  (typeof PRIVACY_POOL_ARTIFACT_IDS)[number];

export interface PrivacyPoolArtifactManifestEntry {
  readonly id: PrivacyPoolArtifactId;
  readonly file: string;
  readonly sourcePath: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface PrivacyPoolsProtocolManifest {
  readonly schemaVersion: 1;
  readonly protocol: "privacy-pools-v1";
  readonly sdk: {
    readonly package: "@0xbow/privacy-pools-core-sdk";
    readonly version: "1.2.0";
    readonly npmIntegrity: string;
    readonly npmTarballSha256: string;
    readonly upstreamCommit: string;
    readonly patches: readonly string[];
  };
  readonly runtimeAdapter: {
    readonly poseidonPackage: "poseidon-lite";
    readonly poseidonVersion: "0.3.0";
    readonly inputWidths: readonly [1, 2, 3];
  };
  readonly artifacts: {
    readonly sourceCommit: string;
    readonly basePath: "privacy-pools/artifacts";
    readonly entries: readonly PrivacyPoolArtifactManifestEntry[];
  };
}

function isExactObject(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isHex(value: unknown, length: number): value is string {
  return (
    typeof value === "string" &&
    value.length === length &&
    /^[a-f0-9]+$/.test(value)
  );
}

function isArtifactId(value: unknown): value is PrivacyPoolArtifactId {
  return (
    typeof value === "string" &&
    (PRIVACY_POOL_ARTIFACT_IDS as readonly string[]).includes(value)
  );
}

function parseArtifactEntry(
  value: unknown,
): PrivacyPoolArtifactManifestEntry | null {
  if (
    !isExactObject(value, ["id", "file", "sourcePath", "bytes", "sha256"])
  ) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isArtifactId(candidate.id) ||
    typeof candidate.file !== "string" ||
    !/^[a-z0-9-]+\.(?:wasm|vkey|zkey)$/.test(candidate.file) ||
    typeof candidate.sourcePath !== "string" ||
    !/^packages\/circuits\/[a-zA-Z0-9_./-]+$/.test(candidate.sourcePath) ||
    !Number.isSafeInteger(candidate.bytes) ||
    (candidate.bytes as number) <= 0 ||
    !isHex(candidate.sha256, 64)
  ) {
    return null;
  }
  return Object.freeze({
    id: candidate.id,
    file: candidate.file,
    sourcePath: candidate.sourcePath,
    bytes: candidate.bytes as number,
    sha256: candidate.sha256,
  });
}

function parseProtocolManifest(value: unknown): PrivacyPoolsProtocolManifest {
  if (
    !isExactObject(value, [
      "schemaVersion",
      "protocol",
      "sdk",
      "runtimeAdapter",
      "artifacts",
    ])
  ) {
    throw new Error("Invalid packaged Privacy Pools protocol manifest");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.protocol !== "privacy-pools-v1" ||
    !isExactObject(candidate.sdk, [
      "package",
      "version",
      "npmIntegrity",
      "npmTarballSha256",
      "upstreamCommit",
      "patches",
    ]) ||
    !isExactObject(candidate.artifacts, [
      "sourceCommit",
      "basePath",
      "entries",
    ]) ||
    !isExactObject(candidate.runtimeAdapter, [
      "poseidonPackage",
      "poseidonVersion",
      "inputWidths",
    ])
  ) {
    throw new Error("Invalid packaged Privacy Pools protocol manifest");
  }

  const sdk = candidate.sdk as Record<string, unknown>;
  const runtimeAdapter = candidate.runtimeAdapter as Record<string, unknown>;
  const artifacts = candidate.artifacts as Record<string, unknown>;
  const patches = sdk.patches;
  const entriesSource = artifacts.entries;
  if (
    sdk.package !== "@0xbow/privacy-pools-core-sdk" ||
    sdk.version !== "1.2.0" ||
    typeof sdk.npmIntegrity !== "string" ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(sdk.npmIntegrity) ||
    !isHex(sdk.npmTarballSha256, 64) ||
    !isHex(sdk.upstreamCommit, 40) ||
    !Array.isArray(patches) ||
    patches.some(
      (patch) => typeof patch !== "string" || patch.length === 0 || patch.length > 256,
    ) ||
    patches.length > 16 ||
    runtimeAdapter.poseidonPackage !== "poseidon-lite" ||
    runtimeAdapter.poseidonVersion !== "0.3.0" ||
    !Array.isArray(runtimeAdapter.inputWidths) ||
    runtimeAdapter.inputWidths.length !== 3 ||
    runtimeAdapter.inputWidths.some((width, index) => width !== index + 1) ||
    !isHex(artifacts.sourceCommit, 40) ||
    artifacts.basePath !== "privacy-pools/artifacts" ||
    !Array.isArray(entriesSource) ||
    entriesSource.length !== PRIVACY_POOL_ARTIFACT_IDS.length
  ) {
    throw new Error("Invalid packaged Privacy Pools protocol manifest");
  }

  const entries = entriesSource.map(parseArtifactEntry);
  if (entries.some((entry) => entry === null)) {
    throw new Error("Invalid packaged Privacy Pools artifact manifest");
  }
  const typedEntries = entries as PrivacyPoolArtifactManifestEntry[];
  const entryIds = new Set(typedEntries.map((entry) => entry.id));
  if (
    PRIVACY_POOL_ARTIFACT_IDS.some((id) => !entryIds.has(id)) ||
    entryIds.size !== PRIVACY_POOL_ARTIFACT_IDS.length
  ) {
    throw new Error("Incomplete packaged Privacy Pools artifact manifest");
  }

  return Object.freeze({
    schemaVersion: 1,
    protocol: "privacy-pools-v1",
    sdk: Object.freeze({
      package: "@0xbow/privacy-pools-core-sdk",
      version: "1.2.0",
      npmIntegrity: sdk.npmIntegrity,
      npmTarballSha256: sdk.npmTarballSha256,
      upstreamCommit: sdk.upstreamCommit,
      patches: Object.freeze([...patches]),
    }),
    runtimeAdapter: Object.freeze({
      poseidonPackage: "poseidon-lite",
      poseidonVersion: "0.3.0",
      inputWidths: Object.freeze([1, 2, 3] as const),
    }),
    artifacts: Object.freeze({
      sourceCommit: artifacts.sourceCommit,
      basePath: "privacy-pools/artifacts",
      entries: Object.freeze(typedEntries),
    }),
  });
}

export const PRIVACY_POOLS_PROTOCOL_MANIFEST = parseProtocolManifest(
  manifestSource,
);

export function getPrivacyPoolArtifactManifestEntry(
  id: PrivacyPoolArtifactId,
): PrivacyPoolArtifactManifestEntry {
  const entry = PRIVACY_POOLS_PROTOCOL_MANIFEST.artifacts.entries.find(
    (candidate) => candidate.id === id,
  );
  if (!entry) throw new Error("Unknown Privacy Pools artifact");
  return entry;
}
