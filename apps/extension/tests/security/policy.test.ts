import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_AUTO_LOCK_TIMEOUT_MS,
  MAX_EXISTING_PASSWORD_BYTES,
  MAX_PASSWORD_LENGTH,
  MIN_NEW_PASSWORD_LENGTH,
  newPasswordPolicyError,
} from "../../src/constants/securityPolicy";

test("new-password policy is strong, bounded, and does not transform input", () => {
  assert.equal(MIN_NEW_PASSWORD_LENGTH, 12);
  assert.equal(MAX_PASSWORD_LENGTH, 256);
  assert.match(newPasswordPolicyError("", "Password") || "", /required/i);
  assert.match(
    newPasswordPolicyError("x".repeat(MIN_NEW_PASSWORD_LENGTH - 1), "Password") || "",
    /at least 12/i,
  );
  assert.equal(
    newPasswordPolicyError(" Abc1234xyz!"),
    null,
    "passwords are length-checked exactly and never silently trimmed",
  );
  assert.equal(newPasswordPolicyError("xYz1".repeat(64)), null);
  assert.match(
    newPasswordPolicyError("x".repeat(MAX_PASSWORD_LENGTH + 1)) || "",
    /at most 256/i,
  );
  assert.match(newPasswordPolicyError(1234) || "", /required/i);
  assert.match(newPasswordPolicyError("a".repeat(12)) || "", /easy to guess/i);
  assert.match(newPasswordPolicyError("password1234") || "", /easy to guess/i);
});

test("missing or invalid auto-lock settings migrate to 15 minutes while explicit Never survives", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const sync: Record<string, unknown> = {};
  const local: Record<string, unknown> = {};
  const browserSession: Record<string, unknown> = {};
  const storageArea = (state: Record<string, unknown>) => ({
    async get(keys?: string | string[]) {
      const selected =
        keys === undefined
          ? Object.keys(state)
          : typeof keys === "string"
            ? [keys]
            : keys;
      return Object.fromEntries(
        selected.filter((key) => key in state).map((key) => [key, state[key]]),
      );
    },
    async set(values: Record<string, unknown>) {
      Object.assign(state, values);
    },
    async remove(keys: string | string[]) {
      for (const key of typeof keys === "string" ? [keys] : keys) {
        delete state[key];
      }
    },
    async clear() {
      for (const key of Object.keys(state)) delete state[key];
    },
  });
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        sync: storageArea(sync),
        local: storageArea(local),
        session: storageArea(browserSession),
      },
      runtime: { lastError: undefined },
    },
  });

  try {
    const session = await import("../../src/chrome/sessionCache");
    assert.equal(DEFAULT_AUTO_LOCK_TIMEOUT_MS, 15 * 60 * 1_000);

    browserSession.sessionId = "legacy-implicit-never";
    browserSession.encryptedSessionPassword = { data: "ciphertext", iv: "iv" };
    local.sessionEncKey = "dormant-recovery-key";
    await session.initializeAutoLockTimeoutDefault();
    assert.equal(sync.autoLockTimeout, DEFAULT_AUTO_LOCK_TIMEOUT_MS);
    assert.deepEqual(
      browserSession,
      {},
      "migrating an implicit Never setting must purge the session half",
    );
    assert.equal(
      local.sessionEncKey,
      undefined,
      "migrating an implicit Never setting must purge the local key half",
    );

    sync.autoLockTimeout = 0;
    browserSession.sessionId = "explicit-never";
    browserSession.encryptedSessionPassword = { data: "ciphertext", iv: "iv" };
    local.sessionEncKey = "preserved-recovery-key";
    await session.initializeAutoLockTimeoutDefault();
    assert.equal(sync.autoLockTimeout, 0, "explicit Never must be preserved");
    assert.equal(browserSession.sessionId, "explicit-never");
    assert.equal(local.sessionEncKey, "preserved-recovery-key");

    sync.autoLockTimeout = -1;
    await session.initializeAutoLockTimeoutDefault();
    assert.equal(sync.autoLockTimeout, DEFAULT_AUTO_LOCK_TIMEOUT_MS);
    assert.deepEqual(browserSession, {});
    assert.equal(local.sessionEncKey, undefined);

    session.updateCachedAutoLockTimeout(-1);
    assert.equal(await session.getAutoLockTimeout(), DEFAULT_AUTO_LOCK_TIMEOUT_MS);
    assert.equal(await session.setAutoLockTimeout(-1), false);

    // A cold cache must not make an authoritative stored Never setting look
    // like the finite default and skip the 0 -> timed cleanup.
    sync.autoLockTimeout = 0;
    session.updateCachedAutoLockTimeout(0);
    await session.storeSessionAtomic(
      "cold-cache-transition",
      true,
      "master",
      "correct horse battery staple",
    );
    assert.ok(browserSession.encryptedSessionPassword);
    assert.ok(local.sessionEncKey);
    session.updateCachedAutoLockTimeout(undefined);
    assert.equal(await session.setAutoLockTimeout(300_000), true);
    assert.deepEqual(browserSession, {});
    assert.equal(local.sessionEncKey, undefined);

    browserSession.encryptedSessionPassword = {
      data: "obsolete-ciphertext",
      iv: "obsolete-iv",
    };
    local.sessionEncKey = "obsolete-key";
    await assert.rejects(
      session.storeSessionAtomic(
        "invalid-password",
        true,
        "master",
        "x".repeat(MAX_EXISTING_PASSWORD_BYTES + 1),
      ),
      /session password is invalid/i,
    );
    assert.equal(browserSession.encryptedSessionPassword, undefined);
    assert.equal(local.sessionEncKey, undefined);
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("creation and rotation backends use the shared policy without restricting legacy unlock", async () => {
  const [
    onboardingSource,
    agentFactorSource,
    passwordRotationSource,
    walletUnlockSource,
    backgroundSource,
  ] = await Promise.all([
    readFile(
      new URL(
        "../../src/chrome/onboardingCredentialInitialization.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../src/chrome/auth/agentFactorHandlers.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/chrome/auth/masterPasswordRotation.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../src/chrome/auth/walletUnlock.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../src/chrome/background.ts", import.meta.url), "utf8"),
  ]);

  assert.match(onboardingSource, /newPasswordPolicyError\(password/);
  assert.match(agentFactorSource, /newPasswordPolicyError\([\s\S]*agentPassword/);
  assert.match(
    passwordRotationSource,
    /newPasswordPolicyError\([\s\S]*newPassword/,
  );
  assert.doesNotMatch(
    walletUnlockSource,
    /newPasswordPolicyError/,
    "older short passwords must remain unlockable",
  );
  assert.match(backgroundSource, /initializeAutoLockTimeoutDefault\(\)/);
});
