import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isPrivacyPoolsMutationAccountType } from "../../src/chrome/privacy/deployment/accountPolicy";
import {
  PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
  PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY,
} from "../../src/chrome/privacy/deployment/manifest";

const sourceRoot = new URL("../../src/chrome/", import.meta.url);

test("mainnet mutations support all custody wallet types and never impersonators", () => {
  for (const type of ["bankr", "privateKey", "seedPhrase"] as const) {
    assert.equal(
      isPrivacyPoolsMutationAccountType(
        type,
        PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
      ),
      true,
    );
  }
  assert.equal(
    isPrivacyPoolsMutationAccountType(
      "impersonator",
      PRIVACY_POOLS_MAINNET_RELEASE_POLICY,
    ),
    false,
  );
  assert.equal(
    isPrivacyPoolsMutationAccountType(
      "bankr",
      PRIVACY_POOLS_SEPOLIA_RELEASE_POLICY,
    ),
    false,
  );
});

test("Bankr Privacy Pools submission retains encrypted-intent and final-effect gates", async () => {
  const [confirmation, processing, pendingAuthorization] = await Promise.all([
    readFile(new URL("transactions/bankrConfirmation.ts", sourceRoot), "utf8"),
    readFile(new URL("transactions/bankrProcessing.ts", sourceRoot), "utf8"),
    readFile(new URL("bankr/pendingAuthorization.ts", sourceRoot), "utf8"),
  ]);

  assert.ok(
    confirmation.indexOf("authorizePrivacyConfirmation(pending)") <
      confirmation.indexOf("removePendingTxRequest(txId)"),
  );
  assert.match(confirmation, /privacyAuthorization\.shield/);
  assert.match(confirmation, /privacyAuthorization\.ragequit/);
  assert.ok(
    pendingAuthorization.indexOf("await beforeEffect?.()") <
      pendingAuthorization.indexOf("beginEffect();"),
  );
  assert.match(processing, /beginPrivacyShieldSubmission/);
  assert.match(processing, /beginPrivacyRagequitSubmission/);
  assert.match(processing, /recordPrivacyShieldSubmitted/);
  assert.match(processing, /recordPrivacyRagequitSubmitted/);
  assert.match(processing, /startReceiptPolling/);
});

test("local Privacy Pools confirmation still covers private-key and seed wallets", async () => {
  const local = await readFile(
    new URL("transactions/localConfirmation.ts", sourceRoot),
    "utf8",
  );
  assert.match(
    local,
    /account\.type !== "privateKey" && account\.type !== "seedPhrase"/,
  );
  assert.match(local, /authorizePrivacyConfirmation\(pending\)/);
  assert.match(local, /privacyAuthorization\.shield/);
  assert.match(local, /privacyAuthorization\.ragequit/);
});
