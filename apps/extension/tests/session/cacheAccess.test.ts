import assert from "node:assert/strict";
import test from "node:test";

import {
  clearInMemoryAuthCache,
  getCachedApiKey,
  getCachedMnemonicKey,
  getCachedPassword,
  getCachedVaultKey,
  getPasswordType,
  getPrivateKeyFromCache,
  isApiKeyCached,
  isWalletUnlocked,
  setCachedApiKey,
  setCachedMnemonicKey,
  setCachedPasswordDirect,
  setCachedPasswordType,
  setCachedVault,
  setCachedVaultKey,
  updateCachedAutoLockTimeout,
} from "../../src/chrome/sessionCache";

test("expiry-aware selectors preserve all three wallet cache paths", () => {
  updateCachedAutoLockTimeout(0);
  try {
    clearInMemoryAuthCache();
    setCachedApiKey("bankr-credential", "agent-password");
    setCachedPasswordType("agent");
    assert.equal(getCachedApiKey(), "bankr-credential");
    assert.equal(isApiKeyCached(), true);
    assert.equal(isWalletUnlocked(), true);
    assert.equal(getPasswordType(), "agent");

    clearInMemoryAuthCache();
    const privateKey = `0x${"11".repeat(32)}` as `0x${string}`;
    setCachedVault([{ id: "private-account", privateKey }]);
    setCachedPasswordType("master");
    assert.equal(getPrivateKeyFromCache("private-account"), privateKey);
    assert.equal(isApiKeyCached(), false);
    assert.equal(isWalletUnlocked(), true);

    clearInMemoryAuthCache();
    const seedKey = `0x${"22".repeat(32)}` as `0x${string}`;
    setCachedVault([{ id: "seed-account", privateKey: seedKey }]);
    setCachedPasswordType("agent");
    assert.equal(getPrivateKeyFromCache("seed-account"), seedKey);
    assert.equal(getPrivateKeyFromCache("private-account"), null);
    assert.equal(isWalletUnlocked(), true);
  } finally {
    clearInMemoryAuthCache();
    updateCachedAutoLockTimeout(900_000);
  }
});

test("biometric hydration remains master without inventing a password", () => {
  updateCachedAutoLockTimeout(0);
  const generalKey = {} as CryptoKey;
  const mnemonicKey = {} as CryptoKey;
  try {
    clearInMemoryAuthCache();
    setCachedVault([]);
    setCachedVaultKey(generalKey);
    setCachedMnemonicKey({ key: mnemonicKey, keyId: "mnemonic-key" });
    setCachedPasswordType("master");
    setCachedPasswordDirect(null);

    assert.equal(getPasswordType(), "master");
    assert.equal(getCachedPassword(), null);
    assert.equal(getCachedVaultKey(), generalKey);
    assert.deepEqual(getCachedMnemonicKey(), {
      key: mnemonicKey,
      keyId: "mnemonic-key",
    });
    assert.equal(isWalletUnlocked(), true);
  } finally {
    clearInMemoryAuthCache();
    updateCachedAutoLockTimeout(900_000);
  }
});

test("view-only capability generations require a coherent key and type", () => {
  const originalNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  updateCachedAutoLockTimeout(60_000);
  const generalKey = {} as CryptoKey;

  try {
    for (const passwordType of ["master", "agent"] as const) {
      clearInMemoryAuthCache();
      setCachedVaultKey(generalKey);
      setCachedPasswordType(passwordType);
      assert.equal(isWalletUnlocked(), true, passwordType);
    }

    // Passkey master hydration has no plaintext password or legacy wallet
    // cache, but the same coherent key/type generation is fully unlocked.
    clearInMemoryAuthCache();
    setCachedVaultKey(generalKey);
    setCachedPasswordType("master");
    setCachedPasswordDirect(null);
    assert.equal(isWalletUnlocked(), true);

    clearInMemoryAuthCache();
    setCachedVaultKey(generalKey);
    assert.equal(isWalletUnlocked(), false, "a key alone has no authority type");

    clearInMemoryAuthCache();
    setCachedPasswordType("master");
    assert.equal(isWalletUnlocked(), false, "a type alone has no wallet key");

    clearInMemoryAuthCache();
    setCachedVaultKey(generalKey);
    setCachedPasswordType("master");
    now += 60_001;
    assert.equal(isWalletUnlocked(), false, "expired generations fail closed");
    assert.equal(getCachedVaultKey(), null);
    assert.equal(getPasswordType(), null);
  } finally {
    clearInMemoryAuthCache();
    updateCachedAutoLockTimeout(900_000);
    Date.now = originalNow;
  }
});
