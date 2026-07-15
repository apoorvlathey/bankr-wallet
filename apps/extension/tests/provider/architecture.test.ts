import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("provider policy has no legacy root implementations", async () => {
  const entries = await readdir(CHROME_ROOT, { withFileTypes: true });
  const legacyNames = new Set([
    "externalProviderValidation.ts",
    "providerChainBoundary.ts",
    "providerErrors.ts",
    "providerRequestLimits.ts",
  ]);
  assert.deepEqual(
    entries
      .filter((entry) => entry.isFile() && legacyNames.has(entry.name))
      .map((entry) => entry.name),
    [],
  );

  assert.match(
    await source("background/messagePipeline.ts"),
    /from "\.\.\/provider\/messageValidation"/,
  );
  assert.match(
    await source("inject.ts"),
    /from "\.\/provider\/contentBridge\/bootstrap"/,
  );
  assert.match(
    await source("impersonator.ts"),
    /from "\.\/provider\/inpage\/bootstrap"/,
  );
  assert.match(
    await source("batch/batchRequestIntake.ts"),
    /from "\.\.\/provider\/batchValidation"/,
  );
});

test("provider policy modules remain independently audit-sized", async () => {
  const budgets: Record<string, number> = {
    "provider/validation.ts": 20,
    "provider/limits.ts": 30,
    "provider/primitives.ts": 50,
    "provider/chainBoundary.ts": 90,
    "provider/errors.ts": 30,
    "provider/signatureValidation.ts": 90,
    "provider/transactionValidation.ts": 180,
    "provider/batchValidation.ts": 110,
    "provider/metadataValidation.ts": 160,
    "provider/messageValidation.ts": 250,
    "inject.ts": 10,
    "impersonator.ts": 10,
    "provider/contentBridge/messagePolicy.ts": 60,
    "provider/contentBridge/bridgeState.ts": 80,
    "provider/contentBridge/gatewayMetadata.ts": 110,
    "provider/contentBridge/initialization.ts": 90,
    "provider/contentBridge/runtimeForwarding.ts": 130,
    "provider/contentBridge/accountChainRoutes.ts": 280,
    "provider/contentBridge/signingRoutes.ts": 280,
    "provider/contentBridge/erc5792Routes.ts": 180,
    "provider/contentBridge/executionPermissionRoute.ts": 130,
    "provider/contentBridge/pageRouter.ts": 30,
    "provider/contentBridge/requestSurface.ts": 130,
    "provider/contentBridge/requestSurfacePreflight.ts": 180,
    "provider/contentBridge/requestSurfaceSignaturePreflight.ts": 80,
    "provider/contentBridge/requestSurfaceBatchPreflight.ts": 90,
    "provider/contentBridge/requestSurfacePermissionPreflight.ts": 90,
    "provider/contentBridge/bootstrap.ts": 20,
    "provider/inpage/pendingRequests.ts": 50,
    "provider/inpage/consoleErrors.ts": 30,
    "provider/inpage/rpcBridge.ts": 50,
    "provider/inpage/requestContext.ts": 20,
    "provider/inpage/accountChainRequests.ts": 180,
    "provider/inpage/erc5792Adapter.ts": 100,
    "provider/inpage/executionPermissionAdapter.ts": 80,
    "provider/inpage/transactionAdapter.ts": 70,
    "provider/inpage/requestRouter.ts": 90,
    "provider/inpage/provider.ts": 100,
    "provider/inpage/providerRegistry.ts": 30,
    "provider/inpage/announcement.ts": 90,
    "provider/inpage/resultPolicy.ts": 40,
    "provider/inpage/resultRouter.ts": 280,
    "provider/inpage/bootstrap.ts": 20,
  };
  for (const [path, maximum] of Object.entries(budgets)) {
    const moduleSource = await source(path);
    assert.ok(
      moduleSource.split("\n").length <= maximum,
      `${path} exceeds its ${maximum}-line audit budget`,
    );
  }
});

test("provider dependency direction is explicit", async () => {
  const messageValidation = await source("provider/messageValidation.ts");
  for (const dependency of [
    "batchValidation",
    "chainBoundary",
    "limits",
    "metadataValidation",
    "signatureValidation",
    "transactionValidation",
  ]) {
    assert.match(messageValidation, new RegExp(`from "\\./${dependency}"`));
  }

  const walletConnect = await source("walletConnect/requestValidation.ts");
  assert.match(walletConnect, /provider\/transactionValidation/);
  assert.match(walletConnect, /provider\/signatureValidation/);
  assert.match(walletConnect, /provider\/batchValidation/);
  assert.doesNotMatch(walletConnect, /messageValidation/);

  const contentBootstrap = await source("provider/contentBridge/bootstrap.ts");
  assert.match(contentBootstrap, /startGatewayMetadataCapture\(\)/);
  assert.match(contentBootstrap, /installRuntimeToPageForwarding\(\)/);
  assert.match(contentBootstrap, /installPageToRuntimeBridge\(\)/);
  assert.match(contentBootstrap, /initializeInpageProvider\(\)/);

  const inpageBootstrap = await source("provider/inpage/bootstrap.ts");
  assert.match(inpageBootstrap, /installDappRpcDiscovery\(\)/);
  assert.match(inpageBootstrap, /installProviderAnnouncementListener\(\)/);
  assert.match(inpageBootstrap, /installContentResultRouter\(\)/);
});
