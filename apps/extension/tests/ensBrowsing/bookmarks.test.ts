import assert from "node:assert/strict";
import test from "node:test";

import {
  addBookmark,
  getAllBookmarks,
  reorderBookmarks,
} from "../../src/chrome/ensBrowsing/bookmarks";

test("connected favorites persist only normalized HTTP(S) launch origins", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const state: Record<string, unknown> = {};
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: state[key] }),
          set: async (changes: Record<string, unknown>) => {
            Object.assign(state, changes);
          },
        },
      },
    },
  });

  try {
    await addBookmark({
      ensName: "APP.EXAMPLE",
      path: "/ignored",
      launchUrl: "https://app.example/path?query=1",
      addedAt: 2,
    });
    await addBookmark({
      ensName: "unsafe.example",
      path: "/",
      launchUrl: "javascript:alert(1)",
      addedAt: 1,
    });

    const bookmarks = await getAllBookmarks();
    assert.equal(bookmarks[0]?.ensName, "app.example");
    assert.equal(bookmarks[0]?.launchUrl, "https://app.example");
    assert.equal(bookmarks[1]?.launchUrl, undefined);

    await reorderBookmarks([
      { ensName: "unsafe.example", path: "/" },
      { ensName: "app.example", path: "/ignored" },
    ]);
    assert.deepEqual(
      (await getAllBookmarks()).map(({ ensName }) => ensName),
      ["unsafe.example", "app.example"],
    );

    await addBookmark({
      ensName: "new.example",
      path: "/",
      launchUrl: "https://new.example",
      addedAt: 3,
    });
    assert.deepEqual(
      (await getAllBookmarks()).map(({ ensName }) => ensName),
      ["new.example", "unsafe.example", "app.example"],
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
