import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PAGE_TO_CONTENT_MESSAGE_TYPES,
  RUNTIME_TO_PAGE_MESSAGE_TYPES,
} from "../../src/chrome/provider/contentBridge/messagePolicy";
import { CONTENT_TO_INPAGE_MESSAGE_TYPES } from "../../src/chrome/provider/inpage/resultPolicy";

const CHROME_ROOT = new URL("../../src/chrome/", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, CHROME_ROOT), "utf8");
}

test("manifest entrypoints stay thin and preserve bootstrap identity", async () => {
  const inject = await source("inject.ts");
  assert.match(
    inject,
    /import \{ startProviderContentBridge \} from "\.\/provider\/contentBridge\/bootstrap"/,
  );
  assert.equal((inject.match(/startProviderContentBridge\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(inject, /addEventListener|chrome\.runtime|postMessage/);

  const inpage = await source("impersonator.ts");
  assert.match(
    inpage,
    /import \{ startInpageProvider \} from "\.\/provider\/inpage\/bootstrap"/,
  );
  assert.equal((inpage.match(/startInpageProvider\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(inpage, /addEventListener|window\.ethereum|postMessage/);

  const injectConfig = await readFile(
    new URL("../../vite.config.inject.ts", import.meta.url),
    "utf8",
  );
  const inpageConfig = await readFile(
    new URL("../../vite.config.inpage.ts", import.meta.url),
    "utf8",
  );
  assert.match(injectConfig, /entry: path\.resolve\(__dirname, "src\/chrome\/inject\.ts"\)/);
  assert.match(injectConfig, /entryFileNames: "inject\.js"/);
  assert.match(inpageConfig, /entry: path\.resolve\(__dirname, "src\/chrome\/impersonator\.ts"\)/);
  assert.match(inpageConfig, /entryFileNames: "inpage\.js"/);
});

test("provider bridge message allowlists are exact", () => {
  assert.deepEqual([...PAGE_TO_CONTENT_MESSAGE_TYPES].sort(), [
    "i_addEthereumChain",
    "i_dappAccounts",
    "i_rpcRequest",
    "i_sendTransaction",
    "i_signatureRequest",
    "i_switchEthereumChain",
    "i_walletExecutionPermissions",
    "i_walletGetCallsStatus",
    "i_walletGetCapabilities",
    "i_walletSendCalls",
    "i_walletShowCallsStatus",
    "i_watchAsset",
  ]);
  assert.deepEqual([...RUNTIME_TO_PAGE_MESSAGE_TYPES].sort(), [
    "dappPermissionRevoked",
    "getInfo",
    "setAccount",
    "setAddress",
    "setChainId",
  ]);
  assert.deepEqual([...CONTENT_TO_INPAGE_MESSAGE_TYPES].sort(), [
    "accountsChanged",
    "dappAccountsResult",
    "init",
    "rpcResponse",
    "sendTransactionResult",
    "setAddress",
    "setChainId",
    "signatureRequestResult",
    "walletExecutionPermissionsResult",
    "walletGetCallsStatusResult",
    "walletGetCapabilitiesResult",
    "walletSendCallsResult",
    "watchAssetResult",
  ]);
});

test("entrypoint domains retain one-way dependencies", async () => {
  const contentFiles = [
    "accountChainRoutes.ts",
    "bridgeState.ts",
    "erc5792Routes.ts",
    "executionPermissionRoute.ts",
    "gatewayMetadata.ts",
    "initialization.ts",
    "messagePolicy.ts",
    "pageRouter.ts",
    "runtimeForwarding.ts",
    "signingRoutes.ts",
  ];
  for (const name of contentFiles) {
    const moduleSource = await source(`provider/contentBridge/${name}`);
    assert.doesNotMatch(moduleSource, /provider\/inpage|\.\.\/inpage/, name);
    assert.doesNotMatch(moduleSource, /vault\/|mnemonic\/|localSigning\//, name);
  }

  const inpageFiles = [
    "accountChainRequests.ts",
    "announcement.ts",
    "erc5792Adapter.ts",
    "executionPermissionAdapter.ts",
    "pendingRequests.ts",
    "provider.ts",
    "requestRouter.ts",
    "resultPolicy.ts",
    "resultRouter.ts",
    "rpcBridge.ts",
    "transactionAdapter.ts",
  ];
  for (const name of inpageFiles) {
    const moduleSource = await source(`provider/inpage/${name}`);
    assert.doesNotMatch(moduleSource, /\bchrome\.|provider\/contentBridge|\.\.\/contentBridge/, name);
    assert.doesNotMatch(moduleSource, /storage|vault\/|mnemonic\/|localSigning\//, name);
  }
});
