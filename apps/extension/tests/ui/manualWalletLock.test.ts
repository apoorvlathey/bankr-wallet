import assert from "node:assert/strict";
import test from "node:test";

import {
  applyExternalWalletAuthMessage,
  requestManualWalletLock,
  type ManualWalletLockStatus,
} from "../../src/app/hooks/useManualWalletLock";

test("manual-lock UI accepts only an explicit successful response", async (t) => {
  const request = (
    response: { success?: boolean } | undefined,
    runtimeError?: unknown,
  ) =>
    requestManualWalletLock(
      (message, callback) => {
        assert.deepEqual(message, { type: "lockWallet" });
        callback(response);
      },
      () => runtimeError,
    );

  await t.test("confirmed success", async () => {
    assert.equal(await request({ success: true }), true);
  });
  await t.test("background rejection", async () => {
    assert.equal(await request({ success: false }), false);
  });
  await t.test("missing response", async () => {
    assert.equal(await request(undefined), false);
  });
  await t.test("runtime error overrides a success payload", async () => {
    assert.equal(await request({ success: true }, new Error("no receiver")), false);
  });
  await t.test("synchronous transport failure", async () => {
    assert.equal(
      await requestManualWalletLock(() => {
        throw new Error("extension context invalidated");
      }),
      false,
    );
  });
  await t.test("a lost response becomes retryable without unlocking the UI", async () => {
    assert.equal(
      await requestManualWalletLock(() => undefined, () => undefined, 1),
      false,
    );
  });
});

test("a lock-failure broadcast blocks every open wallet renderer", () => {
  const createSurface = () => {
    const state: {
      status: ManualWalletLockStatus;
      unlocked: boolean;
      passwordType: "master" | null;
      apiKeyDraft: string | null;
      suppressPasskeyAutoPrompt: boolean;
      view: "main" | "unlock";
      unlockCalls: number;
    } = {
      status: "idle",
      unlocked: true,
      passwordType: "master",
      apiKeyDraft: "renderer-only-api-key",
      suppressPasskeyAutoPrompt: false,
      view: "main",
      unlockCalls: 0,
    };
    return {
      state,
      receive(message: { type: string }) {
        return applyExternalWalletAuthMessage(message, {
          isWalletUnlocked: () => state.unlocked,
          handleUnlock: () => {
            state.unlockCalls += 1;
          },
          showLockedRenderer: (suppressAutoPrompt) => {
            state.unlocked = false;
            state.passwordType = null;
            state.apiKeyDraft = null;
            state.suppressPasskeyAutoPrompt = suppressAutoPrompt;
            state.view = "unlock";
          },
          setStatus: (status) => {
            state.status = status;
          },
        });
      },
    };
  };

  const popup = createSurface();
  const sidepanel = createSurface();
  for (const surface of [popup, sidepanel]) {
    assert.equal(
      surface.receive({ type: "walletLockFailedExternal" }),
      true,
    );
    assert.deepEqual(surface.state, {
      status: "failed",
      unlocked: false,
      passwordType: null,
      apiKeyDraft: null,
      suppressPasskeyAutoPrompt: true,
      view: "unlock",
      unlockCalls: 0,
    });
  }

  assert.equal(
    popup.receive({ type: "walletUnlockedExternal" }),
    true,
  );
  assert.equal(popup.state.status, "idle");
  assert.equal(popup.state.unlockCalls, 1);
});
