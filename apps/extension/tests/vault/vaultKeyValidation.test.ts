import assert from "node:assert/strict";
import test from "node:test";

import {
  decrypt,
  decryptWithVaultKey,
  encrypt,
  encryptVaultKey,
  importVaultKey,
  tryDecryptVaultKey,
} from "../../src/chrome/crypto";

test("vault-key wrappers encrypt only the exact 32-byte view", async () => {
  const backing = new Uint8Array(64).fill(0xa5);
  const view = backing.subarray(16, 48);
  view.forEach((_, index) => {
    view[index] = index;
  });

  const wrapped = await encryptVaultKey(view, "master-password");
  const unwrapped = await tryDecryptVaultKey(wrapped, "master-password");
  assert.deepEqual(unwrapped, new Uint8Array(view));
  assert.equal(unwrapped?.byteLength, 32);
});

test("vault-key APIs reject non-32-byte material", async () => {
  await assert.rejects(
    encryptVaultKey(new Uint8Array(31), "master-password"),
    /exactly 32 bytes/,
  );
  await assert.rejects(
    importVaultKey(new Uint8Array(33)),
    /exactly 32 bytes/,
  );

  const shortButAuthenticCiphertext = await encrypt(
    "sixteen-byte-key",
    "master-password",
  );
  assert.equal(
    await tryDecryptVaultKey(shortButAuthenticCiphertext, "master-password"),
    null,
  );
});

test("encrypted envelopes reject malformed dimensions before decryption", async () => {
  const valid = await encrypt("credential", "master-password");
  await assert.rejects(
    decrypt({ ...valid, salt: "AA==" }, "master-password"),
    /Invalid encrypted data/,
  );
  await assert.rejects(
    decrypt({ ...valid, iv: "AA==" }, "master-password"),
    /Invalid encrypted data/,
  );

  const rawVaultKey = new Uint8Array(32).fill(7);
  const vaultKey = await importVaultKey(rawVaultKey);
  assert.equal(
    await decryptWithVaultKey(vaultKey, { ...valid, salt: "not-empty" }),
    null,
  );
  assert.equal(
    await tryDecryptVaultKey(
      { ...valid, ciphertext: valid.ciphertext },
      "master-password",
    ),
    null,
  );
});
