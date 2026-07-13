import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);
const PROVIDER_MODULES = [
  "validation.ts",
  "limits.ts",
  "primitives.ts",
  "chainBoundary.ts",
  "errors.ts",
  "signatureValidation.ts",
  "transactionValidation.ts",
  "batchValidation.ts",
  "metadataValidation.ts",
  "messageValidation.ts",
];

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("provider policy cannot acquire storage, network, or secret effects", async () => {
  for (const name of PROVIDER_MODULES) {
    const moduleSource = await source(`provider/${name}`);
    assert.doesNotMatch(moduleSource, /\bchrome\.|\bfetch\s*\(/, name);
    assert.doesNotMatch(
      moduleSource,
      /from ["'][^"']*(?:storageLock|sessionCache|auth\/|vault\/|mnemonic\/|localSigning\/|transactions\/|requests\/|walletConnect\/|batch\/)[^"']*["']/,
      name,
    );
  }
});

test("background validates untrusted provider envelopes before routing effects", async () => {
  const background = await source("background/messagePipeline.ts");
  const routerStart = background.indexOf("return (message, sender, sendResponse)");
  const validation = background.indexOf(
    "validateExternalProviderMessage(message)",
    routerStart,
  );
  const authRouter = background.indexOf("routeBackgroundAuthMessage", routerStart);
  const dappRouter = background.indexOf(
    "routeBackgroundDappPermissionMessage",
    routerStart,
  );
  assert.ok(routerStart >= 0 && validation > routerStart);
  assert.ok(authRouter > validation);
  assert.ok(dappRouter > validation);
});

test("content script attests chain state before state-changing dispatch", async () => {
  const signing = await source("provider/contentBridge/signingRoutes.ts");
  assert.match(signing, /getAttestedProviderChainId\(\)/);
  assert.match(signing, /validateProviderChainBoundary\(/);
  for (const type of ["i_sendTransaction", "i_signatureRequest", "i_watchAsset"]) {
    assert.match(signing, new RegExp(`case "${type}"`));
  }

  const batch = await source("provider/contentBridge/erc5792Routes.ts");
  assert.match(batch, /case "i_walletSendCalls"/);
  assert.match(batch, /getAttestedProviderChainId\(\)/);
  assert.match(batch, /validateProviderChainBoundary\(/);

  const permissions = await source(
    "provider/contentBridge/executionPermissionRoute.ts",
  );
  assert.match(permissions, /type !== "i_walletExecutionPermissions"/);
  assert.match(permissions, /getAttestedProviderChainId\(\)/);
  assert.match(permissions, /validateProviderChainBoundary\(/);
});
