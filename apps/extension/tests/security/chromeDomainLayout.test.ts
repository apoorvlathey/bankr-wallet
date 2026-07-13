import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import test from "node:test";

const chromeRoot = new URL("../../src/chrome/", import.meta.url);
const testsRoot = new URL("../", import.meta.url);

// This is an intentional admission list, not a catalog generated from disk.
// A new root file must be rejected in review and placed in an owning domain.
// When a stable root API is genuinely required, add a policy-free facade and
// update this list in the same reviewed tranche.
const ALLOWED_CHROME_ROOT_TYPESCRIPT = [
  "accountStorage.ts",
  "assetChangesExtractor.ts",
  "authHandlers.ts",
  "authTransition.ts",
  "avatarImageCache.ts",
  "background.ts",
  "batchGasEstimation.ts",
  "batchTxHandlers.ts",
  "bridgeApi.ts",
  "bridgeChainsResolver.ts",
  "bridgeStatusPoller.ts",
  "bundleStatusStorage.ts",
  "calldataAddressCandidates.ts",
  "clearSignedMetaSnapshot.ts",
  "clearSigningHandlers.ts",
  "crossDappBatchHandlers.ts",
  "crypto.ts",
  "cryptoUtils.ts",
  "customTokenStorage.ts",
  "delegatedAuthorityPolicy.ts",
  "delegationHandlers.ts",
  "delegationStorage.ts",
  "eip712Validator.ts",
  "ensBanner.ts",
  "erc20CandidatePreflight.ts",
  "erc5792Types.ts",
  "erc7715PermissionHandlers.ts",
  "extensionPopup.ts",
  "feeEstimation.ts",
  "gasEstimation.ts",
  "gasFeeNormalization.ts",
  "impersonator.ts",
  "inject.ts",
  "localSigner.ts",
  "masterAuthorization.ts",
  "mnemonicStorage.ts",
  "nftMetadata.ts",
  "onboardingInitialization.ts",
  "passkeyUnlock.ts",
  "passkeyUnlockCrypto.ts",
  "pendingErc7715PermissionStorage.ts",
  "receiptEnrichment.ts",
  "secretRevealHandlers.ts",
  "sessionCache.ts",
  "sidepanelManager.ts",
  "storageCachePruner.ts",
  "storageLock.ts",
  "storageResultWaiter.ts",
  "swapApi.ts",
  "tokenLogoConstants.ts",
  "tokenMetadata.ts",
  "transactionValidation.ts",
  "transferUtils.ts",
  "trustedWalletUiSender.ts",
  "txHandlers.ts",
  "txHistoryStorage.ts",
  "txSimulation.ts",
  "types.ts",
  "vaultCrypto.ts",
  "walletIcon.ts",
  "walletResetStorage.ts",
] as const;

async function directoryNames(root: URL): Promise<string[]> {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test("chrome root admits only reviewed entrypoints, facades, and primitives", async () => {
  const rootFiles = (await readdir(chromeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(rootFiles, [...ALLOWED_CHROME_ROOT_TYPESCRIPT].sort());
});

test("every chrome audit domain has source and test review maps", async () => {
  const [sourceDomains, testDomains] = await Promise.all([
    directoryNames(chromeRoot),
    directoryNames(testsRoot),
  ]);

  for (const domain of sourceDomains) {
    assert.ok(
      testDomains.includes(domain),
      `${domain}/ must have mirrored tests/${domain}/ coverage`,
    );
    await Promise.all([
      access(new URL(`${domain}/README.md`, chromeRoot)),
      access(new URL(`${domain}/README.md`, testsRoot)),
    ]);
  }
});

test("domain tests do not drift back into the tests root", async () => {
  const rootTests = (await readdir(testsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(rootTests, []);
});
