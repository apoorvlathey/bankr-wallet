import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_RESET_MESSAGE_TYPES,
  createBackgroundResetMessageRouter,
  type BackgroundResetDependencies,
} from "../../src/chrome/background/resetRouter";

function createDependencies(
  overrides: Partial<BackgroundResetDependencies> = {},
): BackgroundResetDependencies {
  return {
    runWalletResetAgainstPendingResolutions: async (options) =>
      options.resolve(),
    runSerializedAuthTransition: async (work) => work(),
    resolvePasswordType: async () => "master",
    handleUnlockWallet: async () => ({ success: true }),
    hasUnresolvedSponsoredTransferIntent: async () => false,
    hasUnresolvedSafeEffects: async () => false,
    readPrivacyResetRisk: async () => ({
      hasShieldData: false,
      backupVerified: false,
    }),
    invalidateAuthCeremonies: () => {},
    invalidateAvatarImageCacheForWalletReset: () => {},
    clearAllAuthState: async () => {},
    resetWalletConnectForWalletReset: async () => {},
    withWalletSecretLock: async (work) => work(),
    performSecurityReset: async () => {},
    clearHistoryState: async () => {},
    deletePrivacyOperationsDatabase: async () => {},
    deletePrivacyCommitmentsDatabase: async () => {},
    deletePrivacyWithdrawalsDatabase: async () => {},
    deletePrivacyRagequitsDatabase: async () => {},
    deletePrivacyPortfolioDatabase: async () => {},
    clearPrivacyPublicEventCache: async () => {},
    getAllLocalStorage: async () => ({ accounts: [] }),
    getWalletLocalStorageKeysToRemove: () => ["accounts"],
    removeLocalStorage: async () => {},
    walletSyncStorageKeys: ["address", "displayAddress"],
    removeSyncStorage: async () => {},
    clearBadge: async () => {},
    getNotificationIds: async () => [],
    clearNotification: () => {},
    error: () => {},
    ...overrides,
  };
}

function dispatch(
  dependencies: BackgroundResetDependencies,
  message: Record<string, unknown> = {
    type: "resetExtension",
    privacyAcknowledged: false,
  },
): Promise<{ response: any; route: any }> {
  return new Promise((resolve) => {
    const router = createBackgroundResetMessageRouter(dependencies);
    let route: any;
    route = router(message, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("reset transport declares its exact unique route set", () => {
  assert.deepEqual(BACKGROUND_RESET_MESSAGE_TYPES, [
    "privacyGetResetRisk",
    "resetExtension",
  ]);
});

test("reset installs its barrier synchronously and preserves destructive order", async () => {
  const events: string[] = [];
  const dependencies = createDependencies({
    runWalletResetAgainstPendingResolutions: (options) => {
      events.push("barrier");
      return options.resolve();
    },
    runSerializedAuthTransition: async (work) => {
      events.push("transition:start");
      const result = await work();
      events.push("transition:end");
      return result;
    },
    resolvePasswordType: async (unlock, restore) => {
      assert.equal(unlock, dependencies.handleUnlockWallet);
      events.push(`password:${restore}`);
      return "master";
    },
    readPrivacyResetRisk: async () => {
      events.push("privacy:risk");
      return { hasShieldData: false, backupVerified: false };
    },
    hasUnresolvedSponsoredTransferIntent: async () => {
      events.push("sponsored");
      return false;
    },
    invalidateAuthCeremonies: () => events.push("auth:invalidate"),
    invalidateAvatarImageCacheForWalletReset: () =>
      events.push("avatar:invalidate"),
    clearAllAuthState: async () => {
      events.push("auth:clear");
    },
    resetWalletConnectForWalletReset: async () => {
      events.push("walletconnect:reset");
    },
    withWalletSecretLock: async (work) => {
      events.push("lock:start");
      const result = await work();
      events.push("lock:end");
      return result;
    },
    performSecurityReset: async () => {
      events.push("security:reset");
    },
    clearHistoryState: async () => {
      events.push("history:clear");
    },
    deletePrivacyOperationsDatabase: async () => {
      events.push("privacy-operations:reset");
    },
    deletePrivacyCommitmentsDatabase: async () => {
      events.push("privacy-commitments:reset");
    },
    deletePrivacyWithdrawalsDatabase: async () => {
      events.push("privacy-withdrawals:reset");
    },
    deletePrivacyRagequitsDatabase: async () => {
      events.push("privacy-ragequits:reset");
    },
    deletePrivacyPortfolioDatabase: async () => {
      events.push("privacy-portfolio:reset");
    },
    clearPrivacyPublicEventCache: async () => {
      events.push("privacy-events:reset");
    },
    getAllLocalStorage: async () => {
      events.push("local:get");
      return { accounts: [], cache: true };
    },
    getWalletLocalStorageKeysToRemove: (storage) => {
      events.push(`manifest:${Object.keys(storage).join(",")}`);
      return ["accounts"];
    },
    removeLocalStorage: async (keys) => {
      events.push(`local:remove:${keys.join(",")}`);
    },
    walletSyncStorageKeys: ["address", "displayAddress"],
    removeSyncStorage: async (keys) => {
      events.push(`sync:remove:${keys.join(",")}`);
    },
    clearBadge: async () => {
      events.push("badge:clear");
    },
    getNotificationIds: async () => {
      events.push("notifications:get");
      return ["one", "two"];
    },
    clearNotification: (id) => events.push(`notification:clear:${id}`),
  });

  const promise = dispatch(dependencies);
  assert.equal(events[0], "barrier", "claim must install before async work");
  const { response, route } = await promise;
  assert.deepEqual(route, { handled: true, keepChannelOpen: true });
  assert.deepEqual(response, { success: true });
  assert.deepEqual(events, [
    "barrier",
    "transition:start",
    "password:true",
    "privacy:risk",
    "sponsored",
    "auth:invalidate",
    "avatar:invalidate",
    "auth:clear",
    "walletconnect:reset",
    "lock:start",
    "security:reset",
    "history:clear",
    "privacy-operations:reset",
    "privacy-commitments:reset",
    "privacy-withdrawals:reset",
    "privacy-ragequits:reset",
    "privacy-portfolio:reset",
    "privacy-events:reset",
    "local:get",
    "manifest:accounts,cache",
    "local:remove:accounts",
    "sync:remove:address,displayAddress",
    "badge:clear",
    "lock:end",
    "notifications:get",
    "notification:clear:one",
    "notification:clear:two",
    "transition:end",
  ]);
});

test("restored non-master and unresolved sponsored state fail before cleanup", async () => {
  let cleanup = false;
  const blockedAgent = await dispatch(
    createDependencies({
      resolvePasswordType: async (_unlock, restore) => {
        assert.equal(restore, true);
        return "agent";
      },
      invalidateAuthCeremonies: () => {
        cleanup = true;
      },
    }),
  );
  assert.deepEqual(blockedAgent.response, {
    success: false,
    error: "Extension reset requires master password",
  });
  assert.equal(cleanup, false);

  const blockedSponsored = await dispatch(
    createDependencies({
      hasUnresolvedSponsoredTransferIntent: async () => true,
      invalidateAuthCeremonies: () => {
        cleanup = true;
      },
    }),
  );
  assert.deepEqual(blockedSponsored.response, {
    success: false,
    error: "Check pending sponsored transfers before resetting WalletChan",
  });
  assert.equal(cleanup, false);

  const blockedSafe = await dispatch(
    createDependencies({
      hasUnresolvedSafeEffects: async () => true,
      invalidateAuthCeremonies: () => {
        cleanup = true;
      },
    }),
  );
  assert.deepEqual(blockedSafe.response, {
    success: false,
    error: "Reconcile pending Safe publications or executions before resetting WalletChan",
  });
  assert.equal(cleanup, false);
});

test("Shield reset preflight is public and an unacknowledged identity blocks cleanup", async () => {
  let cleanup = false;
  const dependencies = createDependencies({
    readPrivacyResetRisk: async () => ({
      hasShieldData: true,
      backupVerified: true,
    }),
    invalidateAuthCeremonies: () => {
      cleanup = true;
    },
  });
  const preflight = await dispatch(dependencies, { type: "privacyGetResetRisk" });
  assert.deepEqual(preflight.response, {
    success: true,
    hasShieldData: true,
    backupVerified: true,
  });

  const blocked = await dispatch(dependencies, {
    type: "resetExtension",
    privacyAcknowledged: false,
  });
  assert.deepEqual(blocked.response, {
    success: false,
    error:
      "Confirm that you saved the Shield recovery phrase or accept that Shield funds cannot be restored",
  });
  assert.equal(cleanup, false);
});

test("reset rejects loose envelopes before installing the destructive barrier", async () => {
  let claimed = false;
  const dependencies = createDependencies({
    runWalletResetAgainstPendingResolutions: async (options) => {
      claimed = true;
      return options.resolve();
    },
  });
  const invalid = await dispatch(dependencies, { type: "resetExtension" });
  assert.deepEqual(invalid.response, { success: false, error: "Invalid request" });
  assert.equal(claimed, false);
});

test("reset conflicts and unexpected failures keep exact response contracts", async () => {
  const conflict = await dispatch(
    createDependencies({
      runWalletResetAgainstPendingResolutions: async (options) =>
        options.conflictResult(),
    }),
  );
  assert.deepEqual(conflict.response, {
    success: false,
    error:
      "A wallet request is currently being resolved. Wait for it to finish before resetting WalletChan.",
  });

  const errors: unknown[][] = [];
  const failed = await dispatch(
    createDependencies({
      runWalletResetAgainstPendingResolutions: async () => {
        throw new Error("storage failed");
      },
      error: (...args) => errors.push(args),
    }),
  );
  assert.deepEqual(failed.response, {
    success: false,
    error: "Failed to reset extension",
  });
  assert.equal(errors[0][0], "Failed to reset extension:");
});

test("background delegates reset before unknown-message handling", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/messagePipeline.ts", import.meta.url),
    "utf8",
  );
  const reset = source.indexOf("routes.routeBackgroundResetMessage(");
  const unknown = source.indexOf("Unknown message type");
  assert.ok(reset > 0 && reset < unknown);
  assert.doesNotMatch(source, /case ["']resetExtension["']/);
});
