import assert from "node:assert/strict";
import test from "node:test";

import {
  getAllDelegatesForAccount,
  getCustomDelegate,
  removeAllDelegatesForAccount,
  removeCustomDelegate,
  setCustomDelegate,
} from "../../src/chrome/delegationStorage";

const DELEGATE_A = "0xAa00000000000000000000000000000000000001";
const DELEGATE_B = "0xBb00000000000000000000000000000000000002";

async function withStorage(
  initial: Record<string, unknown>,
  run: (state: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const state = structuredClone(initial);
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            await Promise.resolve();
            return { [key]: structuredClone(state[key]) };
          },
          async set(values: Record<string, unknown>) {
            await Promise.resolve();
            Object.assign(state, structuredClone(values));
          },
        },
      },
    },
  });
  try {
    await run(state);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "chrome", descriptor);
    else Reflect.deleteProperty(globalThis, "chrome");
  }
}

test("custom-delegate writes preserve the released nested lowercase shape", async () => {
  await withStorage({}, async (state) => {
    await setCustomDelegate("account-a", 1, DELEGATE_A);
    await setCustomDelegate("account-a", 8453, DELEGATE_B);
    assert.deepEqual(state.customDelegates, {
      "account-a": {
        "1": DELEGATE_A.toLowerCase(),
        "8453": DELEGATE_B.toLowerCase(),
      },
    });
    assert.equal(await getCustomDelegate("account-a", 1), DELEGATE_A.toLowerCase());
    assert.deepEqual(await getAllDelegatesForAccount("account-a"), {
      1: DELEGATE_A.toLowerCase(),
      8453: DELEGATE_B.toLowerCase(),
    });
  });
});

test("custom-delegate mutations are linearized and cannot lose sibling writes", async () => {
  await withStorage({}, async (state) => {
    await Promise.all([
      setCustomDelegate("account-a", 1, DELEGATE_A),
      setCustomDelegate("account-b", 8453, DELEGATE_B),
    ]);
    assert.deepEqual(state.customDelegates, {
      "account-a": { "1": DELEGATE_A.toLowerCase() },
      "account-b": { "8453": DELEGATE_B.toLowerCase() },
    });
  });
});

test("per-chain and per-account cleanup remove only the intended mirror", async () => {
  await withStorage(
    {
      customDelegates: {
        "account-a": {
          "1": DELEGATE_A.toLowerCase(),
          "8453": DELEGATE_B.toLowerCase(),
        },
        "account-b": { "1": DELEGATE_B.toLowerCase() },
      },
    },
    async (state) => {
      await removeCustomDelegate("account-a", 1);
      assert.deepEqual(state.customDelegates, {
        "account-a": { "8453": DELEGATE_B.toLowerCase() },
        "account-b": { "1": DELEGATE_B.toLowerCase() },
      });
      await removeCustomDelegate("account-a", 8453);
      assert.deepEqual(state.customDelegates, {
        "account-b": { "1": DELEGATE_B.toLowerCase() },
      });
      await removeAllDelegatesForAccount("account-b");
      assert.deepEqual(state.customDelegates, {});
    },
  );
});

test("delegate reads ignore non-numeric chain keys without rewriting storage", async () => {
  await withStorage(
    {
      customDelegates: {
        "account-a": {
          "1": DELEGATE_A.toLowerCase(),
          nope: DELEGATE_B.toLowerCase(),
        },
      },
    },
    async () => {
      assert.deepEqual(await getAllDelegatesForAccount("account-a"), {
        1: DELEGATE_A.toLowerCase(),
      });
      assert.equal(await getCustomDelegate("missing", 1), null);
    },
  );
});
