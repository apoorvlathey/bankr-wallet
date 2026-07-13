import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTokenLogoUrl,
  resolveTokenMetadata,
} from "../../src/chrome/tokenMetadata";
import { tokenInfoCacheKey } from "../../src/chrome/swap/tokenInfo";
import { tokenLogoCacheKey } from "../../src/chrome/swap/tokenLogo";

const ADDRESS = "0x00000000000000000000000000000000000000a1";
const ADDRESS_WITH_CUSTOM_ONLY =
  "0x00000000000000000000000000000000000000a2";

async function withStorage(
  state: Record<string, unknown>,
  run: (reads: string[]) => Promise<void>,
): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const reads: string[] = [];
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            reads.push(key);
            return { [key]: state[key] };
          },
          async set(values: Record<string, unknown>) {
            Object.assign(state, values);
          },
        },
      },
    },
  });
  try {
    await run(reads);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "chrome", descriptor);
    else Reflect.deleteProperty(globalThis, "chrome");
  }
}

test("token metadata keeps onchain fields and swap-logo source precedence", async () => {
  const now = Date.now();
  const swapLogo = "data:image/png;base64,iVBORw0KGgo=";
  await withStorage(
    {
      [tokenInfoCacheKey(8453, ADDRESS)]: {
        data: { name: "Onchain", symbol: "ON", decimals: 18 },
        fetchedAt: now,
      },
      [tokenLogoCacheKey(8453, ADDRESS)]: {
        logoUrl: swapLogo,
        fetchedAt: now,
      },
      "bungeeTokens:8453": {
        fetchedAt: now,
        tokens: [
          {
            address: ADDRESS,
            name: "Bungee",
            symbol: "BNG",
            decimals: 6,
            logoURI: "https://cdn.example/bungee.png",
            chainId: 8453,
          },
        ],
      },
      customTokens: [
        {
          contractAddress: ADDRESS,
          chainId: 8453,
          name: "Custom",
          symbol: "CUS",
          decimals: 8,
          image: "https://cdn.example/custom.png",
          addedAt: 1,
        },
      ],
    },
    async () => {
      assert.deepEqual(await resolveTokenMetadata(8453, ADDRESS), {
        name: "Onchain",
        symbol: "ON",
        decimals: 18,
        logoUrl: swapLogo,
      });
    },
  );
});

test("public logo resolution excludes watched-asset custom images", async () => {
  const now = Date.now();
  await withStorage(
    {
      [tokenInfoCacheKey(1, ADDRESS_WITH_CUSTOM_ONLY)]: {
        data: { name: "Onchain", symbol: "ON", decimals: 18 },
        fetchedAt: now,
      },
      [tokenLogoCacheKey(1, ADDRESS_WITH_CUSTOM_ONLY)]: {
        logoUrl: "",
        fetchedAt: now,
      },
      "bungeeTokens:1": { fetchedAt: now, tokens: [] },
      customTokens: [
        {
          contractAddress: ADDRESS_WITH_CUSTOM_ONLY,
          chainId: 1,
          name: "Watched",
          symbol: "WATCH",
          decimals: 18,
          image: "https://cdn.example/watched.png",
          addedAt: 1,
        },
      ],
    },
    async (reads) => {
      assert.equal(await resolveTokenLogoUrl(1, ADDRESS_WITH_CUSTOM_ONLY), null);
      assert.equal(reads.includes("customTokens"), false);
    },
  );
});

test("invalid token addresses return empty metadata without storage effects", async () => {
  await withStorage({}, async (reads) => {
    assert.deepEqual(await resolveTokenMetadata(8453, "not-an-address"), {});
    assert.deepEqual(reads, []);
  });
});
