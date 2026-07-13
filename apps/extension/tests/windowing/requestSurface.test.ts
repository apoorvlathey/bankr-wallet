import assert from "node:assert/strict";
import test from "node:test";

import {
  openExtensionPopupWith,
  resolveRequestWindowWith,
  type RequestSurfaceDependencies,
} from "../../src/chrome/windowing/requestSurface";
import {
  openRequestSidePanelWith,
  type RequestSidePanelDependencies,
} from "../../src/chrome/windowing/requestSidePanel";

test("sender window targeting falls back only when the sender window is gone", async () => {
  const sender = { id: 7, state: "normal" } as chrome.windows.Window;
  const focused = { id: 9, state: "normal" } as chrome.windows.Window;
  assert.equal(
    await resolveRequestWindowWith(7, {
      getWindow: async () => sender,
      getLastFocused: async () => focused,
    }),
    sender,
  );
  assert.equal(
    await resolveRequestWindowWith(7, {
      getWindow: async () => {
        throw new Error("closed");
      },
      getLastFocused: async () => focused,
    }),
    focused,
  );
});

function requestDependencies(
  events: string[],
  overrides: Partial<RequestSurfaceDependencies> = {},
): RequestSurfaceDependencies {
  const target = { id: 12, state: "normal" } as chrome.windows.Window;
  return {
    getWindow: async (windowId) => {
      events.push(`window:${windowId}`);
      return target;
    },
    getLastFocused: async () => target,
    getMode: async () => {
      events.push("mode");
      return true;
    },
    isSupportedAsync: async () => {
      events.push("supportedAsync");
      return true;
    },
    isSupported: () => {
      events.push("supportedSync");
      return true;
    },
    openPanel: async (_window, fullscreen) => {
      events.push(`panel:${fullscreen}`);
      return true;
    },
    openPopup: async () => {
      events.push("popup");
    },
    ...overrides,
  };
}

test("request surface prefers a verified panel and falls back to the same target", async () => {
  const panelEvents: string[] = [];
  await openExtensionPopupWith(12, requestDependencies(panelEvents));
  assert.deepEqual(panelEvents, [
    "window:12",
    "mode",
    "supportedAsync",
    "supportedSync",
    "panel:false",
  ]);

  const fallbackEvents: string[] = [];
  await openExtensionPopupWith(
    12,
    requestDependencies(fallbackEvents, {
      openPanel: async () => {
        fallbackEvents.push("panel:false");
        return false;
      },
    }),
  );
  assert.deepEqual(fallbackEvents, [
    "window:12",
    "mode",
    "supportedAsync",
    "supportedSync",
    "panel:false",
    "popup",
  ]);
});

function panelDependencies(
  events: string[],
  overrides: Partial<RequestSidePanelDependencies> = {},
): RequestSidePanelDependencies {
  return {
    pingView: async () => {
      events.push("ping");
      return null;
    },
    openPanel: async (windowId) => {
      events.push(`open:${windowId}`);
    },
    delay: async (milliseconds) => {
      events.push(`delay:${milliseconds}`);
    },
    getContexts: async () => {
      events.push("contexts");
      return [{}];
    },
    warn: () => events.push("warn"),
    ...overrides,
  };
}

test("request side panel reuses a live view and verifies new panels after 600 ms", async () => {
  const reused: string[] = [];
  assert.equal(
    await openRequestSidePanelWith(
      { id: 4 } as chrome.windows.Window,
      false,
      panelDependencies(reused, {
        pingView: async () => {
          reused.push("ping");
          return "pong";
        },
      }),
    ),
    true,
  );
  assert.deepEqual(reused, ["ping"]);

  const opened: string[] = [];
  assert.equal(
    await openRequestSidePanelWith(
      { id: 4 } as chrome.windows.Window,
      true,
      panelDependencies(opened),
    ),
    true,
  );
  assert.deepEqual(opened, ["open:4", "delay:600", "contexts"]);
});

test("request side panel uses ping verification when getContexts is absent", async () => {
  const events: string[] = [];
  let pings = 0;
  assert.equal(
    await openRequestSidePanelWith(
      { id: 5 } as chrome.windows.Window,
      false,
      panelDependencies(events, {
        pingView: async () => {
          events.push("ping");
          pings += 1;
          return pings === 2 ? "pong" : null;
        },
        getContexts: async () => {
          events.push("contexts");
          return null;
        },
      }),
    ),
    true,
  );
  assert.deepEqual(events, [
    "ping",
    "open:5",
    "delay:600",
    "contexts",
    "ping",
  ]);
});
