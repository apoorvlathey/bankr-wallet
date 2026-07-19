import assert from "node:assert/strict";
import test from "node:test";

import { listBrowserConnectedDapps } from "../../src/chrome/ensBrowsing/connectedDapps";
import { handleEnsBrowsingMessage } from "../../src/chrome/ensBrowsing/handlers";

const EXTENSION_ROOT = "chrome-extension://walletchan-test/";

test("browser connected dapps expose only bounded sanitized display metadata", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const permissions = {
    "https://older.example": {
      origin: "https://older.example",
      hostname: "spoofed.example",
      title: ` Older app ${"x".repeat(140)} `,
      favicon: "javascript:alert(1)",
      approvedAt: 1,
      lastConnectedAt: 10,
      secretLikeExtraField: "must not escape",
    },
    "https://newer.example": {
      origin: "https://newer.example",
      hostname: "newer.example",
      favicon: "https://cdn.example/icon.png",
      approvedAt: 2,
      lastConnectedAt: 20,
    },
    malformed: {
      origin: "javascript:alert(1)",
      hostname: "malformed",
      approvedAt: 3,
      lastConnectedAt: 30,
    },
  };
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          get: async () => ({ dappPermissions: permissions }),
        },
      },
    },
  });

  try {
    const result = await listBrowserConnectedDapps();
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], {
      origin: "https://newer.example",
      hostname: "newer.example",
      favicon: "https://cdn.example/icon.png",
      lastConnectedAt: 20,
    });
    const older = result[1];
    assert.ok(older);
    assert.equal(older.origin, "https://older.example");
    assert.equal(older.hostname, "older.example");
    assert.equal(older.favicon, undefined);
    assert.equal(older.title?.length, 120);
    assert.equal("secretLikeExtraField" in older, false);
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("top-level browser route returns the connected dapp projection", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        getURL: (path: string) => new URL(path, EXTENSION_ROOT).toString(),
      },
      storage: {
        local: {
          get: async () => ({
            dappPermissions: {
              "https://app.example": {
                origin: "https://app.example",
                hostname: "app.example",
                approvedAt: 1,
                lastConnectedAt: 2,
              },
            },
          }),
        },
      },
    },
  });

  try {
    const pageUrl = `${EXTENSION_ROOT}browse.html`;
    const response = new Promise<unknown>((resolve) => {
      assert.equal(
        handleEnsBrowsingMessage(
          { type: "ens-list-connected-dapps" },
          {
            url: pageUrl,
            frameId: 0,
            tab: { id: 7, url: pageUrl } as chrome.tabs.Tab,
          },
          resolve,
        ),
        true,
      );
    });
    assert.deepEqual(await response, {
      ok: true,
      dapps: [
        {
          origin: "https://app.example",
          hostname: "app.example",
          lastConnectedAt: 2,
        },
      ],
    });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});

test("top-level browser disconnect revokes permission without deleting its favorite", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const favorite = {
    ensName: "app.example",
    path: "/",
    launchUrl: "https://app.example",
    addedAt: 3,
  };
  const state: Record<string, unknown> = {
    dappPermissions: {
      "https://app.example": {
        origin: "https://app.example",
        hostname: "app.example",
        approvedAt: 1,
        lastConnectedAt: 2,
      },
    },
    ensBookmarks: { "app.example/": favorite },
  };
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        getURL: (path: string) => new URL(path, EXTENSION_ROOT).toString(),
        sendMessage: async () => undefined,
      },
      storage: {
        local: {
          get: async (keys: string | string[]) => {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requested.map((key) => [key, state[key]]));
          },
          set: async (changes: Record<string, unknown>) => {
            Object.assign(state, changes);
          },
        },
      },
      tabs: {
        query: async () => [],
      },
    },
  });

  try {
    const pageUrl = `${EXTENSION_ROOT}browse.html`;
    const response = new Promise<unknown>((resolve) => {
      assert.equal(
        handleEnsBrowsingMessage(
          {
            type: "ens-revoke-connected-dapp",
            origin: "https://app.example",
          },
          {
            url: pageUrl,
            frameId: 0,
            tab: { id: 7, url: pageUrl } as chrome.tabs.Tab,
          },
          resolve,
        ),
        true,
      );
    });
    assert.deepEqual(await response, { ok: true, revoked: true });
    assert.deepEqual(state.dappPermissions, {});
    assert.deepEqual(state.ensBookmarks, { "app.example/": favorite });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
