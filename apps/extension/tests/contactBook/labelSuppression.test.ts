import assert from "node:assert/strict";
import test from "node:test";

import { getEthShLabels } from "../../src/lib/ethShLabelsCache";

test("a saved contact prevents eth.sh label egress", async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key: string) => key === "addressContacts"
          ? { addressContacts: [{ address: "0x1111111111111111111111111111111111111111", label: "Alice" }] }
          : {},
        set: async () => {},
      },
    },
  } as any;
  globalThis.fetch = (async () => {
    fetches += 1;
    throw new Error("network must not be called");
  }) as typeof fetch;
  try {
    assert.deepEqual(await getEthShLabels("0x1111111111111111111111111111111111111111", 8453), ["Alice"]);
    assert.equal(fetches, 0);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});
