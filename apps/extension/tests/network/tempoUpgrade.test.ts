import assert from "node:assert/strict";
import test from "node:test";

import { ensureNetworksInfo } from "../../src/chrome/network/networkMutations";

test("v3.19 Tempo settings migrate atomically without touching unrelated sync state", async () => {
  const syncState: Record<string, unknown> = {
    chainName: "My Tempo",
    autoLockTimeout: 15,
    networksInfo: {
      "My Tempo": {
        chainId: 4217,
        rpcUrl: "https://tempo.drpc.org",
        explorer: "https://explorer.tempo.fi",
        hidden: true,
        isCustom: true,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      },
    },
  };
  const writes: Record<string, unknown>[] = [];
  const previousChrome = globalThis.chrome;

  globalThis.chrome = {
    storage: {
      sync: {
        get: async (keys: string[]) =>
          Object.fromEntries(keys.map((key) => [key, syncState[key]])),
        set: async (updates: Record<string, unknown>) => {
          writes.push(structuredClone(updates));
          Object.assign(syncState, updates);
        },
      },
    },
  } as typeof chrome;

  try {
    const result = await ensureNetworksInfo();

    assert.equal(result.success, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.chainName, "Tempo");
    assert.deepEqual(
      (writes[0]?.networksInfo as Record<string, unknown>).Tempo,
      {
        chainId: 4217,
        rpcUrl: "https://tempo.drpc.org",
        hidden: true,
      },
    );
    assert.equal("My Tempo" in (writes[0]?.networksInfo as object), false);
    assert.equal(syncState.autoLockTimeout, 15);
  } finally {
    globalThis.chrome = previousChrome;
  }
});
