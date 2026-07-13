import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("direct local swap rechecks the exact account at the broadcast boundary", async () => {
  const source = await readFile(
    new URL("../../src/chrome/txHandlers.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("async function broadcastSwapTxLocal");
  const end = source.indexOf("// Batched Swap Execution", start);
  const implementation = source.slice(start, end);
  assert.match(implementation, /signAndBroadcastTransaction\(/);
  assert.match(implementation, /assertLocalAccountEffectBinding\(account\)/);
});

test("the local account effect boundary rejects removal, type conversion, and address replacement", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const state: Record<string, unknown> = {
    accounts: [
      {
        id: "local-1",
        type: "privateKey",
        address: "0x1111111111111111111111111111111111111111",
        createdAt: 1,
      },
    ],
  };
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: state[key] };
          },
          async remove(keys: string | string[]) {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              delete state[key];
            }
          },
        },
      },
    },
  });

  try {
    const { assertLocalAccountEffectBinding } = await import(
      "../../src/chrome/localAccountEffectBoundary"
    );
    const expected = {
      id: "local-1",
      type: "privateKey",
      address: "0x1111111111111111111111111111111111111111",
    };
    await assert.doesNotReject(assertLocalAccountEffectBinding(expected));

    for (const accounts of [
      [],
      [{ ...((state.accounts as object[])[0]), type: "seedPhrase" }],
      [
        {
          ...((state.accounts as object[])[0]),
          address: "0x2222222222222222222222222222222222222222",
        },
      ],
    ]) {
      state.accounts = accounts;
      await assert.rejects(
        assertLocalAccountEffectBinding(expected),
        /account is no longer available/i,
      );
      state.accounts = [
        {
          id: "local-1",
          type: "privateKey",
          address: "0x1111111111111111111111111111111111111111",
          createdAt: 1,
        },
      ];
    }
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
