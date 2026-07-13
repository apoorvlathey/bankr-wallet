import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("ERC-7715 root clutter is limited to stable compatibility entry points", async () => {
  const entries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  const rootModules = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.startsWith("erc7715") ||
          entry.name.startsWith("pendingErc7715")),
    )
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(rootModules, [
    "erc7715PermissionHandlers.ts",
    "pendingErc7715PermissionStorage.ts",
  ]);
  const auditMap = await readChromeModule("erc7715/README.md");
  assert.match(auditMap, /Review order/);
  assert.match(auditMap, /Dependency direction/);
});

test("ERC-7715 methods, queries, status, revocation, and approval are isolated", async () => {
  const [facade, methods, status, queries, snapshot, revoke, confirm, request] =
    await Promise.all([
      readChromeModule("erc7715PermissionHandlers.ts"),
      readChromeModule("erc7715/methods.ts"),
      readChromeModule("erc7715/onchainStatus.ts"),
      readChromeModule("erc7715/queries.ts"),
      readChromeModule("erc7715/grantSnapshot.ts"),
      readChromeModule("erc7715/revocation.ts"),
      readChromeModule("erc7715/confirmation.ts"),
      readChromeModule("erc7715/requestHandler.ts"),
    ]);

  assert.match(facade, /Stable compatibility facade/);
  assert.doesNotMatch(facade, /chrome\.|\b(?:async )?function\b/);
  for (const source of [methods, snapshot]) {
    assert.doesNotMatch(
      source,
      /chrome\.|fetch\(|from ["'].\/(?:sessionCache|localSigner|accountStorage|rpcHttpClient)["']/,
    );
  }
  assert.doesNotMatch(status, /localSigner|sessionCache|masterAuthorization/);
  assert.doesNotMatch(queries, /localSigner|sessionCache|rpcHttpClient/);
  assert.doesNotMatch(revoke, /localSigner|sessionCache|vaultCrypto/);
  assert.match(confirm, /from ["']\.\.\/localSigner["']/);
  assert.doesNotMatch(confirm, /createPublicClient|secureHttpTransport/);
  assert.doesNotMatch(request, /localSigner|sessionCache|vaultCrypto/);
});

test("ERC-7715 facade preserves every public implementation identity", async () => {
  const [facade, methods, status, queries, revoke, confirm, request] =
    await Promise.all([
      import("../../src/chrome/erc7715PermissionHandlers"),
      import("../../src/chrome/erc7715/methods"),
      import("../../src/chrome/erc7715/onchainStatus"),
      import("../../src/chrome/erc7715/queries"),
      import("../../src/chrome/erc7715/revocation"),
      import("../../src/chrome/erc7715/confirmation"),
      import("../../src/chrome/erc7715/requestHandler"),
    ]);
  const expected = {
    ERC7715_PERMISSION_METHODS: methods.ERC7715_PERMISSION_METHODS,
    getSupportedExecutionPermissions: methods.getSupportedExecutionPermissions,
    isErc7715PermissionMethod: methods.isErc7715PermissionMethod,
    getGrantedExecutionPermissions: queries.getGrantedExecutionPermissions,
    getActiveErc7715PermissionGrantsWithOnchainSync:
      status.getActiveErc7715PermissionGrantsWithOnchainSync,
    handleInitiateErc7715PermissionRevoke:
      revoke.handleInitiateErc7715PermissionRevoke,
    handleConfirmErc7715PermissionRequest:
      confirm.handleConfirmErc7715PermissionRequest,
    handleRejectErc7715PermissionRequest:
      confirm.handleRejectErc7715PermissionRequest,
    handleErc7715PermissionMethod: request.handleErc7715PermissionMethod,
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(facade[name], value, name);
  }
});

test("ERC-7715 validation, caveat, and preflight facades preserve implementation identities", async () => {
  const [
    registry,
    permissionTypes,
    rules,
    permissionValidation,
    caveats,
    caveatDefinitions,
    caveatBuilder,
    preflight,
    eligibility,
    normalization,
    pending,
  ] = await Promise.all([
    import("../../src/chrome/erc7715/registry"),
    import("../../src/chrome/erc7715/permissionTypes"),
    import("../../src/chrome/erc7715/ruleValidation"),
    import("../../src/chrome/erc7715/permissionValidation"),
    import("../../src/chrome/erc7715/caveats"),
    import("../../src/chrome/erc7715/caveatDefinitions"),
    import("../../src/chrome/erc7715/caveatBuilder"),
    import("../../src/chrome/erc7715/preflight"),
    import("../../src/chrome/erc7715/preflightEligibility"),
    import("../../src/chrome/erc7715/preflightNormalization"),
    import("../../src/chrome/erc7715/pendingPermissionRequest"),
  ]);

  assert.equal(
    registry.ERC7715_SUPPORTED_PERMISSION_TYPES,
    permissionTypes.ERC7715_SUPPORTED_PERMISSION_TYPES,
  );
  assert.equal(
    registry.ERC7715_SUPPORTED_RULE_TYPES,
    permissionTypes.ERC7715_SUPPORTED_RULE_TYPES,
  );
  assert.equal(
    registry.isErc7715SupportedPermissionType,
    permissionTypes.isErc7715SupportedPermissionType,
  );
  assert.equal(registry.validateErc7715Rules, rules.validateErc7715Rules);
  assert.equal(
    registry.validateErc7715Permission,
    permissionValidation.validateErc7715Permission,
  );
  assert.equal(
    registry.validateErc7715PermissionRequestPayload,
    permissionValidation.validateErc7715PermissionRequestPayload,
  );
  assert.equal(
    registry.getErc7715PermissionJustification,
    permissionValidation.getErc7715PermissionJustification,
  );

  assert.equal(
    caveats.ERC7710_DELEGATION_MANAGER,
    caveatDefinitions.ERC7710_DELEGATION_MANAGER,
  );
  assert.equal(
    caveats.METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS,
    caveatDefinitions.METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS,
  );
  assert.equal(
    caveats.buildErc7715PermissionCaveats,
    caveatBuilder.buildErc7715PermissionCaveats,
  );

  assert.equal(
    preflight.assertRequestExecutionPermissionsEligible,
    eligibility.assertRequestExecutionPermissionsEligible,
  );
  assert.equal(
    preflight.getPermissionExpirySeconds,
    normalization.getPermissionExpirySeconds,
  );
  assert.equal(preflight.parseHexChainId, normalization.parseHexChainId);
  assert.equal(
    preflight.makePendingPermissionRequest,
    pending.makePendingPermissionRequest,
  );
});

test("ERC-7715 pure policy layers cannot reach account, session, RPC, or Chrome state", async () => {
  const pureModules = await Promise.all(
    [
      "permissionTypes.ts",
      "validationPrimitives.ts",
      "ruleValidation.ts",
      "permissionValidation.ts",
      "caveatDefinitions.ts",
      "caveatEncoding.ts",
      "caveatBuilder.ts",
      "preflightNormalization.ts",
    ].map((name) => readChromeModule(`erc7715/${name}`)),
  );
  for (const source of pureModules) {
    assert.doesNotMatch(
      source,
      /chrome\.|createPublicClient|secureHttpTransport|accountStorage|sessionCache|localSigner/,
    );
    assert.doesNotMatch(source, /from ["']\.\/(?:registry|caveats|preflight)["']/);
  }

  for (const name of ["registry.ts", "caveats.ts", "preflight.ts"]) {
    const facade = await readChromeModule(`erc7715/${name}`);
    assert.match(facade, /Stable local facade/);
    assert.doesNotMatch(facade, /\b(?:async )?function\b/);
  }

  const entries = await readdir(
    new URL("../../src/chrome/erc7715/", import.meta.url),
    { withFileTypes: true },
  );
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    if (["registry.ts", "caveats.ts", "preflight.ts"].includes(entry.name)) {
      continue;
    }
    const implementation = await readChromeModule(`erc7715/${entry.name}`);
    assert.doesNotMatch(
      implementation,
      /from ["']\.\/(?:registry|caveats|preflight)["']/,
      `${entry.name} must depend on focused implementations, not a facade`,
    );
  }
});
