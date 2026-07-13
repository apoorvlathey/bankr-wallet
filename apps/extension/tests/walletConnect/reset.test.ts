import assert from "node:assert/strict";
import test from "node:test";
import {
  createWalletConnectStorageNamespace,
  parseWalletConnectStorageNamespace,
  teardownWalletConnectSdkState,
} from "../../src/chrome/walletConnect/reset";
import { getWalletLocalStorageKeysToRemove } from "../../src/chrome/walletResetStorage";

test("missing namespace preserves pre-upgrade WalletConnect storage", () => {
  assert.equal(parseWalletConnectStorageNamespace(undefined), undefined);
  assert.equal(parseWalletConnectStorageNamespace(""), null);
  assert.equal(parseWalletConnectStorageNamespace("legacy-prefix"), null);

  const namespace = createWalletConnectStorageNamespace(
    "2f291f74-394f-43f8-aec5-1c4c616a7f29",
  );
  assert.equal(
    namespace,
    "wallet-reset-2f291f74-394f-43f8-aec5-1c4c616a7f29",
  );
  assert.equal(parseWalletConnectStorageNamespace(namespace), namespace);
});

test("generic wallet cleanup preserves the reset namespace tombstone", () => {
  const keys = getWalletLocalStorageKeysToRemove({
    walletConnectStorageNamespace:
      "wallet-reset-2f291f74-394f-43f8-aec5-1c4c616a7f29",
    walletConnectPendingRequests: {},
    walletConnectChainId: 8453,
  });

  assert.equal(keys.includes("walletConnectStorageNamespace"), false);
  assert.equal(keys.includes("walletConnectPendingRequests"), true);
  assert.equal(keys.includes("walletConnectChainId"), true);
});

test("wallet reset disconnects sessions and pairings before purging SDK state", async () => {
  const calls: string[] = [];
  const storageKeys = new Set(["wc@2:core:keychain", "wc@2:client:session"]);
  const core = {
    storage: {
      async getKeys() {
        calls.push("storage:getKeys");
        return [...storageKeys];
      },
      async removeItem(key: string) {
        calls.push(`storage:remove:${key}`);
        storageKeys.delete(key);
      },
    },
    pairing: {
      getPairings() {
        return [{ topic: "pairing-a" }, { topic: "pairing-b" }];
      },
      async disconnect({ topic }: { topic: string }) {
        calls.push(`pairing:${topic}`);
      },
    },
    heartbeat: {
      stop() {
        calls.push("heartbeat:stop");
      },
    },
    relayer: {
      async transportClose() {
        calls.push("relay:close");
      },
    },
  };
  const kit = {
    core,
    getActiveSessions() {
      return { "session-a": {}, "session-b": {} };
    },
    async disconnectSession({ topic }: { topic: string }) {
      calls.push(`session:${topic}`);
    },
  };

  const summary = await teardownWalletConnectSdkState(core, kit, {
    timeoutMs: 100,
  });

  assert.deepEqual(summary, {
    sessionsDisconnected: 2,
    pairingsDisconnected: 2,
    storageKeysRemoved: 2,
    warnings: [],
  });
  assert.deepEqual(storageKeys, new Set());
  assert.ok(calls.includes("session:session-a"));
  assert.ok(calls.includes("session:session-b"));
  assert.ok(calls.includes("pairing:pairing-a"));
  assert.ok(calls.includes("pairing:pairing-b"));
  assert.ok(calls.indexOf("relay:close") < calls.indexOf("storage:getKeys"));
});

test("peer cleanup failures cannot prevent local identity purge", async () => {
  const removed: string[] = [];
  const core = {
    storage: {
      async getKeys() {
        return ["identity", "sessions"];
      },
      async removeItem(key: string) {
        removed.push(key);
      },
    },
    pairing: {
      getPairings() {
        return [{ topic: "offline-pairing" }];
      },
      async disconnect() {
        throw new Error("relay unavailable");
      },
    },
    heartbeat: {
      stop() {},
    },
    relayer: {
      async transportClose() {
        throw new Error("already closed");
      },
    },
  };
  const kit = {
    core,
    getActiveSessions() {
      return { "offline-session": {} };
    },
    async disconnectSession() {
      throw new Error("relay unavailable");
    },
  };

  const summary = await teardownWalletConnectSdkState(core, kit, {
    timeoutMs: 100,
  });

  assert.deepEqual(removed.sort(), ["identity", "sessions"]);
  assert.equal(summary.sessionsDisconnected, 0);
  assert.equal(summary.pairingsDisconnected, 0);
  assert.equal(summary.storageKeysRemoved, 2);
  assert.equal(summary.warnings.length, 3);
});
