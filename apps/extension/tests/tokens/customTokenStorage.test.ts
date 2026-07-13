import assert from "node:assert/strict";
import test from "node:test";

import {
  addCustomToken,
  getCustomTokens,
  removeCustomToken,
  updateCustomToken,
  type CustomToken,
} from "../../src/chrome/customTokenStorage";

const ADDRESS_A = "0xAbCd000000000000000000000000000000000001";
const ADDRESS_B = "0xAbCd000000000000000000000000000000000002";

async function withStorage(
  initial: CustomToken[],
  run: (state: Record<string, unknown>, setCalls: () => number) => Promise<void>,
): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const state: Record<string, unknown> = { customTokens: initial };
  let writes = 0;
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: state[key] };
          },
          async set(values: Record<string, unknown>) {
            writes += 1;
            Object.assign(state, values);
          },
        },
      },
    },
  });
  try {
    await run(state, () => writes);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "chrome", descriptor);
    else Reflect.deleteProperty(globalThis, "chrome");
  }
}

test("custom-token storage preserves lowercase identity and serializes adds", async () => {
  const originalNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    await withStorage([], async (state) => {
      await Promise.all([
        addCustomToken({
          contractAddress: ADDRESS_A,
          chainId: 8453,
          name: "Token A",
          symbol: "A",
          decimals: 18,
        }),
        addCustomToken({
          contractAddress: ADDRESS_B,
          chainId: 8453,
          name: "Token B",
          symbol: "B",
          decimals: 6,
          image: "https://cdn.example/b.png",
        }),
      ]);
      assert.deepEqual(state.customTokens, [
        {
          contractAddress: ADDRESS_A.toLowerCase(),
          chainId: 8453,
          name: "Token A",
          symbol: "A",
          decimals: 18,
          addedAt: 1_700_000_000_000,
        },
        {
          contractAddress: ADDRESS_B.toLowerCase(),
          chainId: 8453,
          name: "Token B",
          symbol: "B",
          decimals: 6,
          image: "https://cdn.example/b.png",
          addedAt: 1_700_000_000_000,
        },
      ]);
    });
  } finally {
    Date.now = originalNow;
  }
});

test("custom-token add deduplicates by chain/address and allows other chains", async () => {
  const existing: CustomToken = {
    contractAddress: ADDRESS_A.toLowerCase(),
    chainId: 1,
    name: "Original",
    symbol: "OLD",
    decimals: 18,
    addedAt: 1,
  };
  await withStorage([existing], async (_state, setCalls) => {
    await addCustomToken({
      contractAddress: ADDRESS_A,
      chainId: 1,
      name: "Duplicate",
      symbol: "DUP",
      decimals: 6,
    });
    assert.equal(setCalls(), 0);

    await addCustomToken({
      contractAddress: ADDRESS_A,
      chainId: 8453,
      name: "Base token",
      symbol: "BASE",
      decimals: 18,
    });
    assert.equal((await getCustomTokens()).length, 2);
  });
});

test("custom-token update and removal retain the released whole-array shape", async () => {
  const tokens: CustomToken[] = [
    {
      contractAddress: ADDRESS_A.toLowerCase(),
      chainId: 8453,
      name: "Old",
      symbol: "OLD",
      decimals: 18,
      addedAt: 11,
    },
    {
      contractAddress: ADDRESS_B.toLowerCase(),
      chainId: 8453,
      name: "Keep",
      symbol: "KEEP",
      decimals: 6,
      addedAt: 22,
    },
  ];
  await withStorage(tokens, async (state, setCalls) => {
    await updateCustomToken(8453, ADDRESS_A, {
      name: "Updated",
      symbol: "NEW",
      decimals: 8,
      image: "https://cdn.example/new.png",
    });
    assert.deepEqual((state.customTokens as CustomToken[])[0], {
      ...tokens[0],
      name: "Updated",
      symbol: "NEW",
      decimals: 8,
      image: "https://cdn.example/new.png",
    });

    const writes = setCalls();
    await updateCustomToken(1, ADDRESS_A, { name: "Missing" });
    assert.equal(setCalls(), writes);

    await removeCustomToken(8453, ADDRESS_A);
    assert.deepEqual(state.customTokens, [tokens[1]]);
  });
});
