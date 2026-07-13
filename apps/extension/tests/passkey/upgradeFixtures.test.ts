import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  loadPasskeyUnlockRecord,
  unwrapPasskeyRecordKeys,
} from "../../src/chrome/passkeyUnlockCrypto";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";
import { FROZEN_PASSKEY_FIXTURE } from "../fixtures/passkeyUpgradeRecords";

const asBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");

test("frozen passkey records remain readable across extension upgrades", async (t) => {
  const chromeHarness = createChromeStorageHarness();

  try {
    await t.test("released V1 raw-PRF wrappers still recover the general key", async () => {
      chromeHarness.stores.local.passkeyUnlock =
        structuredClone(FROZEN_PASSKEY_FIXTURE.v1);
      chromeHarness.clearObservations();

      const record = await loadPasskeyUnlockRecord();
      assert.deepEqual(record, FROZEN_PASSKEY_FIXTURE.v1);
      assert.ok(record);
      const unwrapped = await unwrapPasskeyRecordKeys(
        record,
        FROZEN_PASSKEY_FIXTURE.prfKeyMaterial,
      );
      assert.ok(unwrapped);
      assert.equal(
        asBase64(unwrapped.vaultKeyBytes),
        FROZEN_PASSKEY_FIXTURE.expectedVaultKeyBase64,
      );
      assert.equal(unwrapped.mnemonicKeyBytes, undefined);
      assert.deepEqual(chromeHarness.writes, []);
    });

    await t.test("V2 HKDF wrappers recover both purpose-separated keys", async () => {
      chromeHarness.stores.local.passkeyUnlock =
        structuredClone(FROZEN_PASSKEY_FIXTURE.v2);
      chromeHarness.clearObservations();

      const record = await loadPasskeyUnlockRecord();
      assert.deepEqual(record, FROZEN_PASSKEY_FIXTURE.v2);
      assert.ok(record);
      const unwrapped = await unwrapPasskeyRecordKeys(
        record,
        FROZEN_PASSKEY_FIXTURE.prfKeyMaterial,
      );
      assert.ok(unwrapped?.mnemonicKeyBytes);
      assert.equal(
        asBase64(unwrapped.vaultKeyBytes),
        FROZEN_PASSKEY_FIXTURE.expectedVaultKeyBase64,
      );
      assert.equal(
        asBase64(unwrapped.mnemonicKeyBytes),
        FROZEN_PASSKEY_FIXTURE.expectedMnemonicKeyBase64,
      );
      assert.equal(
        unwrapped.mnemonicKeyId,
        FROZEN_PASSKEY_FIXTURE.v2.mnemonicKeyId,
      );
      assert.deepEqual(chromeHarness.writes, []);
    });

    await t.test("wrong PRF material fails closed without rewriting records", async () => {
      chromeHarness.stores.local.passkeyUnlock =
        structuredClone(FROZEN_PASSKEY_FIXTURE.v2);
      chromeHarness.clearObservations();

      assert.equal(
        await unwrapPasskeyRecordKeys(
          FROZEN_PASSKEY_FIXTURE.v2,
          Buffer.alloc(32, 0x7f).toString("base64url"),
        ),
        null,
      );
      assert.deepEqual(
        chromeHarness.stores.local.passkeyUnlock,
        FROZEN_PASSKEY_FIXTURE.v2,
      );
      assert.deepEqual(chromeHarness.writes, []);
    });
  } finally {
    chromeHarness.restore();
  }
});
