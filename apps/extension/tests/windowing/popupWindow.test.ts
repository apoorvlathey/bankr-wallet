import assert from "node:assert/strict";
import test from "node:test";

import { popupPlacementForWindow } from "../../src/chrome/windowing/popupGeometry";
import {
  openOrFocusRequestPopupWith,
  openPopupWindowWith,
  type PopupWindowDependencies,
} from "../../src/chrome/windowing/popupWindow";

test("popup geometry stays on the sender monitor and clamps constrained work areas", () => {
  assert.deepEqual(
    popupPlacementForWindow({ left: 100, top: 50, width: 1200, height: 900 }),
    { left: 930, top: 130 },
  );
  assert.deepEqual(
    popupPlacementForWindow({
      left: -1440,
      top: 0,
      width: 1440,
      height: 900,
    }),
    { left: -370, top: 80 },
  );
  assert.deepEqual(
    popupPlacementForWindow({ left: 0, top: 20, width: 300, height: 500 }),
    { left: 0, top: 20 },
  );
  assert.deepEqual(popupPlacementForWindow(null), {});
});

function popupDependencies(
  events: string[],
  overrides: Partial<PopupWindowDependencies> = {},
): PopupWindowDependencies {
  return {
    getPopups: async () => {
      events.push("getPopups");
      return [];
    },
    getTabs: async (windowId) => {
      events.push(`tabs:${windowId}`);
      return [];
    },
    focus: async (windowId) => {
      events.push(`focus:${windowId}`);
    },
    getLastFocused: async () => {
      events.push("lastFocused");
      return { left: 10, top: 20, width: 1000, height: 800 } as any;
    },
    runtimeUrl: (path) => {
      events.push(`url:${path}`);
      return `chrome-extension://walletchan/${path}`;
    },
    create: async (options) => {
      events.push(`create:${JSON.stringify(options)}`);
    },
    ...overrides,
  };
}

test("request popup reuses an existing WalletChan window", async () => {
  const events: string[] = [];
  await openOrFocusRequestPopupWith(
    { id: 99 } as chrome.windows.Window,
    popupDependencies(events, {
      getPopups: async () => {
        events.push("getPopups");
        return [{ id: 1 }, { id: 2 }] as chrome.windows.Window[];
      },
      getTabs: async (windowId) => {
        events.push(`tabs:${windowId}`);
        return [
          {
            url:
              windowId === 2
                ? "chrome-extension://walletchan/index.html?request=1"
                : "https://example.com",
          },
        ] as chrome.tabs.Tab[];
      },
    }),
  );
  assert.deepEqual(events, [
    "getPopups",
    "url:index.html",
    "tabs:1",
    "tabs:2",
    "focus:2",
  ]);
});

test("detached popup preserves URL/getAll ordering and clamped creation geometry", async () => {
  const events: string[] = [];
  await openPopupWindowWith(popupDependencies(events));
  assert.deepEqual(events.slice(0, 3), [
    "url:index.html",
    "getPopups",
    "lastFocused",
  ]);

  const createEvent = events.at(-1)!;
  assert.match(createEvent, /^create:/);
  const options = JSON.parse(createEvent.slice("create:".length));
  assert.deepEqual(options, {
    url: "chrome-extension://walletchan/index.html",
    type: "popup",
    width: 360,
    height: 680,
    focused: true,
    left: 640,
    top: 100,
  });
});
