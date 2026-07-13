import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeConnectedDappRequest,
  DAPP_CONNECTION_REQUIRED_CODE,
  trustedTopLevelDappOrigin,
} from "../../src/chrome/dapp/requestPolicy";

type StorageRecord = Record<string, unknown>;

test("provider transaction/signature intake requires an exact connected origin", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {
    dappPermissions: {
      "https://app.example": {
        origin: "https://app.example",
        hostname: "app.example",
        approvedAt: 1,
        lastConnectedAt: 1,
      },
    },
  };

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: local[key] };
          },
        },
      },
    },
  });

  const sender = (
    origin: string,
    options: { frameId?: number; tabUrl?: string } = {},
  ) =>
    ({
      origin,
      url: `${origin}/page`,
      frameId: options.frameId ?? 0,
      tab: {
        id: 7,
        url: options.tabUrl ?? `${origin}/page`,
      },
    }) as chrome.runtime.MessageSender;

  try {
    await t.test("accepts the approved top-level sender and canonicalizes it", async () => {
      const result = await authorizeConnectedDappRequest(
        sender("https://APP.example"),
      );
      assert.deepEqual(result, {
        authorized: true,
        origin: "https://app.example",
        tabId: 7,
      });
    });

    await t.test("rejects an unapproved exact origin", async () => {
      const result = await authorizeConnectedDappRequest(
        sender("https://app.example:8443"),
      );
      assert.equal(result.authorized, false);
      if (!result.authorized) assert.equal(result.code, DAPP_CONNECTION_REQUIRED_CODE);
    });

    await t.test("rejects subframes even when their origin is approved", async () => {
      const result = await authorizeConnectedDappRequest(
        sender("https://app.example", { frameId: 2 }),
      );
      assert.equal(result.authorized, false);
    });

    await t.test("rejects a sender during a cross-origin navigation race", () => {
      assert.equal(
        trustedTopLevelDappOrigin(
          sender("https://app.example", {
            tabUrl: "https://other.example/next",
          }),
        ),
        null,
      );
    });

    await t.test("never falls back to a page-supplied origin", async () => {
      const result = await authorizeConnectedDappRequest({
        frameId: 0,
        tab: { id: 7, url: "https://app.example/page" },
      } as chrome.runtime.MessageSender);
      assert.equal(result.authorized, false);
    });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
