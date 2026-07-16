import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

type CredentialKind = "password" | "passkey-vault";
type FailureKind = "local-key" | "session-half" | "both";

test("manual lock revokes either recovery half before reporting success", async (t) => {
  for (const credentialKind of ["password", "passkey-vault"] as const) {
    for (const failureKind of ["local-key", "session-half", "both"] as const) {
      await t.test(`${credentialKind}: ${failureKind}`, async () => {
        await runRevocationCase(credentialKind, failureKind);
      });
    }
  }
});

async function runRevocationCase(
  credentialKind: CredentialKind,
  failureKind: FailureKind,
): Promise<void> {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 0 },
  });

  try {
    const authTransition = await import("../../src/chrome/authTransition");
    const termination = await import("../../src/chrome/auth/sessionTermination");
    const session = await import("../../src/chrome/sessionCache");

    authTransition.clearManualLockRestorationBlock();
    await session.clearAllAuthState();
    session.updateCachedAutoLockTimeout(0);
    if (credentialKind === "password") {
      await session.storeSessionAtomic(
        "manual-lock-password-session",
        true,
        "master",
        "manual-lock-password",
      );
    } else {
      await session.storePasskeySessionAtomic(
        "manual-lock-passkey-session",
        new Uint8Array(32).fill(0x51),
        Buffer.alloc(32, 0x52).toString("base64"),
      );
    }
    session.setCachedPasswordDirect("temporary-memory-secret");
    session.setCachedPasswordType("master");
    chromeHarness.clearObservations();

    if (failureKind === "local-key" || failureKind === "both") {
      chromeHarness.failNext({
        area: "local",
        operation: "remove",
        key: "sessionEncKey",
      });
    }
    if (failureKind === "session-half" || failureKind === "both") {
      chromeHarness.failNext({ area: "session", operation: "clear" });
    }

    const lock = termination.terminateActiveAuthSession(true);
    if (failureKind === "both") {
      await assert.rejects(lock, /Failed to revoke persisted session capability/);
    } else {
      assert.deepEqual(await lock, { success: true });
    }

    assert.equal(session.getCachedPassword(), null);
    assert.equal(session.getPasswordType(), null);
    assert.equal(session.getCurrentSessionId(), null);

    const lockBroadcastTypes = chromeHarness.runtimeMessages
      .map((message) => (message as { type?: string }).type)
      .filter((type) => type?.startsWith("walletLock"));
    assert.deepEqual(lockBroadcastTypes, [
      failureKind === "both"
        ? "walletLockFailedExternal"
        : "walletLockedExternal",
    ]);

    if (failureKind === "local-key") {
      assert.deepEqual(chromeHarness.stores.session, {});
      assert.notEqual(chromeHarness.stores.local.sessionEncKey, undefined);
    } else if (failureKind === "session-half") {
      assert.notDeepEqual(chromeHarness.stores.session, {});
      assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);
    } else {
      assert.notDeepEqual(chromeHarness.stores.session, {});
      assert.notEqual(chromeHarness.stores.local.sessionEncKey, undefined);
    }

    let unlockCalls = 0;
    const restored = await session.tryRestoreSession(async () => {
      unlockCalls += 1;
      return { success: true, passwordType: "master" as const };
    });
    assert.equal(restored, false);
    assert.equal(unlockCalls, 0);
    assert.equal(
      authTransition.isSessionRestorationBlockedByManualLock(),
      true,
    );

    if (failureKind === "both") {
      chromeHarness.clearObservations();
      assert.deepEqual(
        await termination.terminateActiveAuthSession(true),
        { success: true },
      );
      session.clearInMemoryAuthCache();
      assert.equal(
        await session.tryRestoreSession(async () => {
          throw new Error("revoked session must not reach unlock");
        }),
        false,
      );
    }
  } finally {
    const authTransition = await import("../../src/chrome/authTransition");
    authTransition.clearManualLockRestorationBlock();
    chromeHarness.restore();
  }
}
