import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

test("passkey persistence encrypts only the exact vault-key view", async () => {
  const chromeHarness = createChromeStorageHarness();
  let restoredBytes: Uint8Array | null = null;

  try {
    const persistence = await import(
      "../../src/chrome/session/passkeyPersistence"
    );
    const backing = new Uint8Array(96).fill(0xa5);
    const vaultKeyView = backing.subarray(19, 51);
    vaultKeyView.set(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
    const beforeStore = Uint8Array.from(backing);
    const passkeyBinding = Buffer.alloc(32, 0xb6).toString("base64");

    await persistence.storePasskeySessionAtomic(
      "offset-view-session",
      vaultKeyView,
      passkeyBinding,
    );

    const record = chromeHarness.stores.session.encryptedSessionVaultKey as {
      data: string;
    };
    assert.equal(Buffer.from(record.data, "base64").byteLength, 48);
    assert.deepEqual(backing, beforeStore);

    const restored = await persistence.getSessionPasskeyCredential(
      "offset-view-session",
    );
    assert.ok(restored);
    restoredBytes = restored.vaultKeyBytes;
    assert.equal(restored.passkeyBinding, passkeyBinding);
    assert.deepEqual(restoredBytes, vaultKeyView);
    assert.deepEqual(backing.subarray(0, 19), beforeStore.subarray(0, 19));
    assert.deepEqual(backing.subarray(51), beforeStore.subarray(51));
  } finally {
    restoredBytes?.fill(0);
    chromeHarness.restore();
  }
});
