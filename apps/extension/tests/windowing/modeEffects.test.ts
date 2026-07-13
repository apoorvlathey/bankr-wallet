import assert from "node:assert/strict";
import test from "node:test";

import {
  readArcBrowserFlag,
  readSidePanelModeState,
  setActionPopup,
  writeSidePanelMode,
} from "../../src/chrome/windowing/chromeAdapter";
import { initializeSidePanelWith } from "../../src/chrome/windowing/initialization";
import {
  type SidePanelModeDependencies,
  setSidePanelModeWith,
  transitionSidePanelToPopupWith,
} from "../../src/chrome/windowing/modeTransitions";

function modeDependencies(
  events: string[],
  overrides: Partial<SidePanelModeDependencies> = {},
): SidePanelModeDependencies {
  return {
    isSupported: () => {
      events.push("supported");
      return true;
    },
    readArcFlag: async () => {
      events.push("readArc");
      return false;
    },
    readModeState: async () => {
      events.push("readMode");
      return {};
    },
    writeMode: async (enabled) => {
      events.push(`write:${enabled}`);
    },
    setPopup: async (popup) => {
      events.push(`popup:${popup || "<empty>"}`);
    },
    getCloser: () => async (windowId) => {
      events.push(`close:${windowId}`);
    },
    popupPath: "popup-init.html",
    warn: () => events.push("warn"),
    ...overrides,
  };
}

test("mode transitions preserve action-popup and persistence ordering", async () => {
  const enabling: string[] = [];
  assert.equal(
    await setSidePanelModeWith(true, modeDependencies(enabling)),
    true,
  );
  assert.deepEqual(enabling, [
    "readArc",
    "supported",
    "popup:<empty>",
    "write:true",
  ]);

  const disabling: string[] = [];
  assert.equal(
    await setSidePanelModeWith(false, modeDependencies(disabling)),
    true,
  );
  assert.deepEqual(disabling, [
    "readArc",
    "supported",
    "popup:popup-init.html",
    "write:false",
  ]);

  const unsupported: string[] = [];
  assert.equal(
    await setSidePanelModeWith(
      false,
      modeDependencies(unsupported, {
        isSupported: () => {
          unsupported.push("supported");
          return false;
        },
      }),
    ),
    true,
  );
  assert.deepEqual(unsupported, [
    "readArc",
    "supported",
    "write:false",
    "popup:popup-init.html",
  ]);
});

test("detached popup opens before the side panel closes", async () => {
  const events: string[] = [];
  const result = await transitionSidePanelToPopupWith(
    42,
    async () => {
      events.push("openDetached");
    },
    modeDependencies(events),
  );

  assert.deepEqual(result, { success: true, panelClosed: true });
  assert.deepEqual(events, [
    "readArc",
    "supported",
    "popup:popup-init.html",
    "write:false",
    "openDetached",
    "close:42",
  ]);
});

test("initialization disables automatic opening before reading mode", async () => {
  const events: string[] = [];
  await initializeSidePanelWith({
    disableAutomaticPanelOpen: async () => {
      events.push("disableAutomatic");
    },
    readModeState: async () => {
      events.push("readMode");
      return { sidePanelMode: true };
    },
    isSupported: () => {
      events.push("supported");
      return true;
    },
    setPopup: async (popup) => {
      events.push(`popup:${popup || "<empty>"}`);
    },
    popupPath: "popup-init.html",
    error: () => events.push("error"),
  });
  assert.deepEqual(events, [
    "disableAutomatic",
    "readMode",
    "supported",
    "popup:<empty>",
  ]);
});

test("Chrome adapter preserves released sync keys and action payloads", async () => {
  const originalChrome = globalThis.chrome;
  const events: unknown[] = [];
  (globalThis as any).chrome = {
    storage: {
      sync: {
        get: async (keys: string[]) => {
          events.push(["get", keys]);
          return { isArcBrowser: true, sidePanelMode: false };
        },
        set: async (values: Record<string, unknown>) => {
          events.push(["set", values]);
        },
      },
    },
    action: {
      setPopup: async (options: Record<string, unknown>) => {
        events.push(["popup", options]);
      },
    },
  };

  try {
    assert.equal(await readArcBrowserFlag(), true);
    assert.deepEqual(await readSidePanelModeState(), {
      isArcBrowser: true,
      sidePanelMode: false,
    });
    await writeSidePanelMode(true);
    await setActionPopup("popup-init.html");
  } finally {
    (globalThis as any).chrome = originalChrome;
  }

  assert.deepEqual(events, [
    ["get", ["isArcBrowser"]],
    ["get", ["isArcBrowser", "sidePanelMode"]],
    ["set", { sidePanelMode: true }],
    ["popup", { popup: "popup-init.html" }],
  ]);
});
