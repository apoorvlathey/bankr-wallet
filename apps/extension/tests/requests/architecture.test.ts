import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const movedRootFiles = new Set([
  "dappPermissionStorage.ts",
  "pendingAddChainStorage.ts",
  "pendingBatchAcknowledgementLifecycle.ts",
  "pendingBatchTxStorage.ts",
  "pendingBridgeStorage.ts",
  "pendingDappRequestLifecycle.ts",
  "pendingMetadataPromptLifecycle.ts",
  "pendingRequestExpiry.ts",
  "pendingRequestLifecycle.ts",
  "pendingRequestResolution.ts",
  "pendingSignatureRelease.ts",
  "pendingSignatureStorage.ts",
  "pendingTxStorage.ts",
  "pendingWalletConnectLifecycle.ts",
  "pendingWatchAssetStorage.ts",
  "pinnedRequest.ts",
]);

const readRequestModule = (name: string) =>
  readFile(
    new URL(`../../src/chrome/requests/${name}`, import.meta.url),
    "utf8",
  );

test("durable request implementations have one audit folder and no root family", async () => {
  const rootEntries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  assert.deepEqual(
    rootEntries
      .filter((entry) => entry.isFile() && movedRootFiles.has(entry.name))
      .map((entry) => entry.name),
    [],
  );
  assert.ok(
    rootEntries.some(
      (entry) =>
        entry.isFile() && entry.name === "pendingErc7715PermissionStorage.ts",
    ),
  );

  const domainEntries = await readdir(
    new URL("../../src/chrome/requests/", import.meta.url),
    { withFileTypes: true },
  );
  for (const entry of domainEntries.filter(
    (candidate) => candidate.isFile() && candidate.name.endsWith(".ts"),
  )) {
    const source = await readRequestModule(entry.name);
    assert.ok(
      source.split(/\r?\n/).length <= 400,
      `${entry.name} exceeds the durable-request audit ceiling`,
    );
  }
});

test("durable request storage keys and result routes stay compatible", async () => {
  const filesAndKeys: Array<[string, string[]]> = [
    ["pendingTxStorage.ts", ["pendingTxRequests"]],
    ["pendingSignatureStorage.ts", ["pendingSignatureRequests"]],
    ["pendingBatchTxStorage.ts", ["pendingBatchTxRequests"]],
    ["pendingWatchAssetStorage.ts", ["pendingWatchAssetRequests"]],
    ["pendingAddChainStorage.ts", ["pendingAddChainRequests"]],
    ["pendingBridgeStorage.ts", ["pendingBridges"]],
    [
      "dappPermissionStorage.ts",
      ["dappPermissions", "pendingDappConnectionRequests"],
    ],
  ];
  for (const [file, keys] of filesAndKeys) {
    const source = await readRequestModule(file);
    for (const key of keys) assert.match(source, new RegExp(`"${key}"`));
  }

  const [terminalization, metadata, dapp, batchAck] = await Promise.all([
    readRequestModule("pendingRequestTerminalization.ts"),
    readRequestModule("pendingMetadataPromptLifecycle.ts"),
    readRequestModule("pendingDappRequestLifecycle.ts"),
    readRequestModule("pendingBatchAcknowledgementLifecycle.ts"),
  ]);
  for (const prefix of ["txResult:", "sigResult:"]) {
    assert.match(terminalization, new RegExp(prefix));
  }
  for (const prefix of ["addChainResult:", "watchAssetResult:"]) {
    assert.match(metadata, new RegExp(prefix));
  }
  assert.match(dapp, /dappConnectionResult:/);
  assert.match(batchAck, /batchTxAck:/);
});

test("request claims and terminal effects retain their safety ordering", async () => {
  const [resolution, terminalization] = await Promise.all([
    readRequestModule("pendingRequestResolution.ts"),
    readRequestModule("pendingRequestTerminalization.ts"),
  ]);
  assert.ok(
    resolution.indexOf("claims.set(request.key, claim)") <
      resolution.indexOf("Promise.resolve().then(options.resolve)"),
  );
  assert.ok(
    resolution.indexOf("Promise.resolve().then(options.resolve)") <
      resolution.indexOf("claims.delete(key)"),
  );
  assert.match(resolution, /Do not release on an unexpected error/);

  const transactionBranch = terminalization.slice(
    terminalization.indexOf('kind === "transaction"'),
    terminalization.indexOf('kind === "signature"'),
  );
  assert.ok(
    transactionBranch.indexOf("removePendingTxRequest") <
      transactionBranch.indexOf("writeBridgedProviderResult"),
  );
  const signatureBranch = terminalization.slice(
    terminalization.indexOf('kind === "signature"'),
    terminalization.indexOf('kind === "batchTransaction"'),
  );
  assert.ok(
    signatureBranch.indexOf("removePendingSignatureRequest") <
      signatureBranch.indexOf("writeBridgedProviderResult"),
  );
  assert.match(terminalization, /saveWalletConnectTerminalResponse/);
  assert.match(terminalization, /walletConnect\/resultBridge/);
});

test("background and request modules compose direct domain paths", async () => {
  const [providerComposition, accountComposition, lifecycle, terminalization, resolution, pinned] =
    await Promise.all([
      readFile(
        new URL("../../src/chrome/background/composition/providerRoutes.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../src/chrome/background/composition/accountRoutes.ts", import.meta.url),
        "utf8",
      ),
      readRequestModule("pendingRequestLifecycle.ts"),
      readRequestModule("pendingRequestTerminalization.ts"),
      readRequestModule("pendingRequestResolution.ts"),
      readRequestModule("pinnedRequest.ts"),
    ]);

  assert.match(providerComposition, /from ["']\.\.\/\.\.\/requests\/pendingTxStorage["']/);
  assert.match(
    accountComposition,
    /from ["']\.\.\/\.\.\/requests\/pendingRequestLifecycle["']/,
  );
  assert.doesNotMatch(
    providerComposition + accountComposition,
    /from ["'](?:\.\.\/){2}pending(?:Tx|Signature|Request)/,
  );
  assert.match(lifecycle, /from ["'].\/pendingRequestTerminalization["']/);
  assert.doesNotMatch(resolution, /chrome\.|storageLock|walletConnect/);
  assert.doesNotMatch(pinned, /chrome\.|storageLock|walletConnect/);
  assert.match(terminalization, /from ["']\.\.\/walletConnect\/storage["']/);
});
