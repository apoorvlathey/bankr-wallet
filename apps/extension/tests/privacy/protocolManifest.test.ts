import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import {
  PRIVACY_POOLS_PROTOCOL_MANIFEST,
  type PrivacyPoolArtifactId,
} from "../../src/chrome/privacy/protocol/manifest";
import {
  PrivacyPoolArtifactError,
  verifyPrivacyPoolArtifact,
} from "../../src/chrome/privacy/protocol/artifacts";

const extensionRoot = new URL("../../", import.meta.url);

test("official SDK package and provenance are exact pins", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", extensionRoot), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const lockfile = await readFile(
    new URL("../../pnpm-lock.yaml", extensionRoot),
    "utf8",
  );
  const manifest = PRIVACY_POOLS_PROTOCOL_MANIFEST;

  assert.equal(
    packageJson.dependencies?.[manifest.sdk.package],
    manifest.sdk.version,
  );
  assert.match(lockfile, /'@0xbow\/privacy-pools-core-sdk@1\.2\.0':/);
  assert.ok(lockfile.includes(manifest.sdk.npmIntegrity));
  assert.equal(
    manifest.sdk.upstreamCommit,
    "434fbb8dc6783b98e100630f3debad1920d385e8",
  );
  assert.deepEqual(manifest.sdk.patches, []);
  assert.deepEqual(manifest.runtimeAdapter, {
    poseidonPackage: "poseidon-lite",
    poseidonVersion: "0.3.0",
    inputWidths: [1, 2, 3],
  });
  assert.equal(packageJson.dependencies?.[manifest.runtimeAdapter.poseidonPackage], "0.3.0");
  assert.match(lockfile, /poseidon-lite@0\.3\.0:/);
});

test("the background consumes only the SDK pure crypto source", async () => {
  const config = await readFile(
    new URL("vite.config.background.ts", extensionRoot),
    "utf8",
  );
  const sdkCrypto = await readFile(
    new URL(
      "node_modules/@0xbow/privacy-pools-core-sdk/src/crypto.ts",
      extensionRoot,
    ),
    "utf8",
  );

  assert.match(
    config,
    /["']@0xbow\/privacy-pools-core-sdk["']\s*:\s*path\.resolve\([\s\S]*?src\/crypto\.ts/,
  );
  assert.match(config, /privacySdkServiceWorkerBoundary\(\)/);
  assert.match(config, /curve_bn128/);
  assert.match(config, /The nonce must be less than 2 \^ 128/);
  assert.match(config, /maci-crypto\/build\/ts\/hashing\.js/);
  assert.match(config, /privacy\/protocol\/poseidonLite\.ts/);
  assert.match(sdkCrypto, /export function generateMasterKeys/);
  assert.match(sdkCrypto, /export function hashPrecommitment/);
  assert.doesNotMatch(sdkCrypto, /from ["']snarkjs["']/);
  assert.doesNotMatch(sdkCrypto, /createObjectURL/);
});

test("the service-worker SDK source matches the pinned derivation vector", async () => {
  const sdkCrypto = await import(
    "../../node_modules/@0xbow/privacy-pools-core-sdk/src/crypto.js"
  );
  const phrase =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const keys = sdkCrypto.generateMasterKeys(phrase);
  const deposit = sdkCrypto.generateDepositSecrets(keys, 123456789n, 0n);

  assert.deepEqual(keys, {
    masterNullifier:
      5166235667641908426209962078587403958102858901466456053922152107655534895382n,
    masterSecret:
      2859269148228400235778357386281504626275970321488783750166899577742903687816n,
  });
  assert.equal(
    sdkCrypto.hashPrecommitment(deposit.nullifier, deposit.secret),
    21381912566992095161997580774829960999416698525239585958091240626965757610693n,
  );
});

test("the CSP-compatible prover adapter pins the reviewed snarkjs release", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", extensionRoot), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const snarkPackage = JSON.parse(
    await readFile(
      new URL("node_modules/snarkjs/package.json", extensionRoot),
      "utf8",
    ),
  ) as { version?: string; license?: string };

  assert.equal(packageJson.dependencies?.snarkjs, "0.7.5");
  assert.equal(snarkPackage.version, "0.7.5");
  assert.equal(snarkPackage.license, "GPL-3.0");
});

test("every packaged artifact matches the pinned byte length and SHA-256", async () => {
  const manifest = PRIVACY_POOLS_PROTOCOL_MANIFEST;
  for (const entry of manifest.artifacts.entries) {
    const artifactUrl = new URL(
      `public/${manifest.artifacts.basePath}/${entry.file}`,
      extensionRoot,
    );
    const [fileStat, bytes] = await Promise.all([
      stat(artifactUrl),
      readFile(artifactUrl),
    ]);
    assert.equal(fileStat.size, entry.bytes, `${entry.id} size`);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      entry.sha256,
      `${entry.id} SHA-256`,
    );
    await verifyPrivacyPoolArtifact(
      entry.id,
      new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
  }
});

test("artifact verification fails closed on size and integrity changes", async () => {
  const entry = PRIVACY_POOLS_PROTOCOL_MANIFEST.artifacts.entries.find(
    (candidate) => candidate.id === "commitment-vkey",
  );
  assert.ok(entry);
  const original = new Uint8Array(
    await readFile(
      new URL(
        `public/${PRIVACY_POOLS_PROTOCOL_MANIFEST.artifacts.basePath}/${entry.file}`,
        extensionRoot,
      ),
    ),
  );

  await assert.rejects(
    verifyPrivacyPoolArtifact(
      entry.id as PrivacyPoolArtifactId,
      original.subarray(0, original.byteLength - 1),
    ),
    (error: unknown) =>
      error instanceof PrivacyPoolArtifactError && error.code === "invalid-size",
  );

  const changed = original.slice();
  changed[0] ^= 1;
  await assert.rejects(
    verifyPrivacyPoolArtifact(entry.id as PrivacyPoolArtifactId, changed),
    (error: unknown) =>
      error instanceof PrivacyPoolArtifactError &&
      error.code === "invalid-integrity",
  );
});

test("numeric prover budgets and distribution gates are explicit", async () => {
  const [
    budgets,
    packageJson,
    copying,
    thirdPartyNotices,
    licensePackager,
  ] = await Promise.all([
    readFile(
      new URL("privacy-prover.budgets.json", extensionRoot),
      "utf8",
    ).then(JSON.parse),
    readFile(new URL("package.json", extensionRoot), "utf8").then(JSON.parse),
    readFile(new URL("COPYING", extensionRoot), "utf8"),
    readFile(new URL("THIRD_PARTY_NOTICES.md", extensionRoot), "utf8"),
    readFile(
      new URL("scripts/package-license-files.mjs", extensionRoot),
      "utf8",
    ),
  ]);
  assert.deepEqual(budgets, {
    schemaVersion: 1,
    cleanBuildBytes: 57_671_680,
    artifactBytes: 25_165_824,
    proverWorkerBytes: 524_288,
    backgroundBundleBytes: 4_194_304,
    fixedSelfTestMs: 60_000,
    restartSelfTestMs: 60_000,
    peakBrowserRssDeltaBytes: 536_870_912,
    maxConcurrentProofs: 1,
  });
  const distribution = JSON.parse(await readFile(
    new URL("privacy-prover.distribution.json", extensionRoot),
    "utf8",
  ));
  assert.equal(packageJson.license, "GPL-3.0-only");
  assert.equal(distribution.status, "approved-gpl-v4");
  assert.equal(distribution.effectiveRelease, "4.0.0");
  assert.deepEqual(distribution.allowedTargets, [
    "unpacked-sepolia-test",
    "github-release",
    "chrome-web-store",
    "firefox-addons",
  ]);
  assert.deepEqual(distribution.packagedNotices, [
    "LICENSE.txt",
    "THIRD_PARTY_NOTICES.txt",
    "SOURCE_CODE.txt",
  ]);
  assert.match(
    copying,
    /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3, 29 June 2007/,
  );
  assert.match(
    thirdPartyNotices,
    /snarkjs[\s\S]*0\.7\.5[\s\S]*0KIMS Association/,
  );
  for (const dependency of [
    "@iden3/bigarray",
    "@iden3/binfileutils",
    "fastfile",
    "ffjavascript",
    "r1csfile",
    "wasmbuilder",
    "wasmcurves",
  ]) {
    assert.match(thirdPartyNotices, new RegExp(dependency.replace("/", "\\/")));
  }
  assert.match(
    packageJson.scripts.build,
    /privacy:budgets:verify && pnpm license:package/,
  );
  for (const notice of distribution.packagedNotices) {
    assert.match(licensePackager, new RegExp(notice.replace(".", "\\.")));
  }
  for (const [script, target] of [
    ["zip", "github-release"],
    ["zip:cws", "chrome-web-store"],
    ["zip:firefox", "firefox-addons"],
    ["sign:firefox", "firefox-addons"],
  ] as const) {
    assert.match(
      packageJson.scripts[script],
      new RegExp(`privacy-prover-distribution\\.mjs --target=${target}`),
    );
  }
});

test("Firefox stays proof-disabled until it has an equivalent packaged gate", async () => {
  const [manifest, coordinator] = await Promise.all([
    readFile(new URL("manifest.firefox.json", extensionRoot), "utf8"),
    readFile(
      new URL("src/chrome/privacy/prover/coordinator.ts", extensionRoot),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(manifest, /["']offscreen["']/);
  assert.match(
    coordinator,
    /available:\s*\(\)\s*=>\s*\n?\s*typeof chrome\.offscreen\?\.createDocument === ["']function["']/,
  );
});
