// Background settings transport contract.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BACKGROUND_SETTINGS_MESSAGE_TYPES,
  createBackgroundSettingsMessageRouter,
} from "../../src/chrome/background/settingsRouter";

const TEST_ENVIRONMENT = {
  openPopupWindow: async () => {},
  setSyncStorage: async () => {},
  setActionPopup: async () => {},
  popupPath: "popup-init.html",
};

function responseCapture() {
  let resolve!: (value: unknown) => void;
  const response = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { response, sendResponse: resolve };
}

test("settings transport stays focused and declares every route", async () => {
  const source = await readFile(
    new URL("../../src/chrome/background/settingsRouter.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.split(/\r?\n/).length <= 400);
  const switchTypes = [...source.matchAll(/^ {6}case ["']([^"']+)["']/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...new Set(switchTypes)].sort(),
    [...BACKGROUND_SETTINGS_MESSAGE_TYPES].sort(),
  );
});

test("network registry routes preserve arguments, results, and async channels", async () => {
  const calls: Array<[string, unknown]> = [];
  const route = createBackgroundSettingsMessageRouter(TEST_ENVIRONMENT, {
    ensureNetworksInfo: async () => ({ success: false, error: "ensure" }),
    addNetworkIfMissing: async (input) => {
      calls.push(["add", input]);
      return { success: false, error: "add" };
    },
    updateNetworkEntry: async (input) => {
      calls.push(["update", input]);
      return { success: false, error: "update" };
    },
  });
  const ensured = responseCapture();
  const added = responseCapture();
  const updated = responseCapture();

  assert.deepEqual(
    route({ type: "ensureNetworksInfo" }, ensured.sendResponse),
    { handled: true, keepChannelOpen: true },
  );
  route(
    { type: "addNetwork", chainName: "Base", entry: { chainId: 8453 } },
    added.sendResponse,
  );
  route(
    {
      type: "updateNetwork",
      chainName: "Base",
      nextChainName: "Base Mainnet",
      entry: { chainId: 8453 },
      rpcUrls: ["https://mainnet.base.org"],
    },
    updated.sendResponse,
  );
  assert.deepEqual(await ensured.response, { success: false, error: "ensure" });
  assert.deepEqual(await added.response, { success: false, error: "add" });
  assert.deepEqual(await updated.response, { success: false, error: "update" });
  assert.deepEqual(calls, [
    ["add", { chainName: "Base", entry: { chainId: 8453 } }],
    [
      "update",
      {
        chainName: "Base",
        nextChainName: "Base Mainnet",
        entry: { chainId: 8453 },
        rpcUrls: ["https://mainnet.base.org"],
      },
    ],
  ]);
});

test("network visibility and deletion retain active-account compatibility", async () => {
  const calls: Array<[string, unknown]> = [];
  const route = createBackgroundSettingsMessageRouter(TEST_ENVIRONMENT, {
    getActiveAccount: async () => ({ type: "seedPhrase" }) as any,
    setNetworkHiddenState: async (input) => {
      calls.push(["hidden", input]);
      return { success: false, error: "hidden" };
    },
    deleteNetworkEntry: async (input) => {
      calls.push(["delete", input]);
      return { success: false, error: "delete" };
    },
  });
  const hidden = responseCapture();
  const deleted = responseCapture();

  route(
    { type: "setNetworkHidden", chainName: "Ethereum", hidden: true },
    hidden.sendResponse,
  );
  route(
    { type: "deleteNetwork", chainName: "Custom" },
    deleted.sendResponse,
  );
  assert.deepEqual(await hidden.response, { success: false, error: "hidden" });
  assert.deepEqual(await deleted.response, { success: false, error: "delete" });
  assert.deepEqual(calls, [
    [
      "hidden",
      {
        chainName: "Ethereum",
        hidden: true,
        activeAccountType: "seedPhrase",
      },
    ],
    ["delete", { chainName: "Custom", activeAccountType: "seedPhrase" }],
  ]);
});

test("Arc detection synchronously responds while restoring popup mode", async () => {
  const events: string[] = [];
  const responses: unknown[] = [];
  const route = createBackgroundSettingsMessageRouter({
    ...TEST_ENVIRONMENT,
    setSyncStorage: async (values) => {
      events.push(`storage:${JSON.stringify(values)}`);
    },
    setActionPopup: async (popup) => {
      events.push(`popup:${popup}`);
    },
  });

  assert.deepEqual(
    route({ type: "setArcBrowser", isArc: true }, (value) =>
      responses.push(value),
    ),
    { handled: true, keepChannelOpen: false },
  );
  await Promise.resolve();
  assert.deepEqual(responses, [{ success: true }]);
  assert.deepEqual(events, [
    'storage:{"sidePanelMode":false,"isArcBrowser":true}',
    "popup:popup-init.html",
  ]);
});

test("sidepanel mode routes preserve payloads and window scoping", async () => {
  const transitions: unknown[][] = [];
  const openPopup = async () => {};
  const route = createBackgroundSettingsMessageRouter(
    { ...TEST_ENVIRONMENT, openPopupWindow: openPopup },
    {
      isSidePanelSupportedAsync: async () => true,
      getSidePanelMode: async () => false,
      setSidePanelMode: async () => false,
      transitionSidePanelToPopup: async (windowId, open) => {
        transitions.push([windowId, open]);
        return { success: true, panelClosed: false };
      },
    },
  );
  const supported = responseCapture();
  const mode = responseCapture();
  const enabled = responseCapture();
  const disabled = responseCapture();
  const transition = responseCapture();
  const malformedTransition = responseCapture();

  route({ type: "isSidePanelSupported" }, supported.sendResponse);
  route({ type: "getSidePanelMode" }, mode.sendResponse);
  route({ type: "setSidePanelMode", enabled: true }, enabled.sendResponse);
  route({ type: "setSidePanelMode", enabled: false }, disabled.sendResponse);
  route(
    { type: "switchSidePanelToPopup", windowId: 42 },
    transition.sendResponse,
  );
  route(
    { type: "switchSidePanelToPopup", windowId: "42" },
    malformedTransition.sendResponse,
  );
  assert.deepEqual(await supported.response, { supported: true });
  assert.deepEqual(await mode.response, { enabled: false });
  assert.deepEqual(await enabled.response, {
    success: false,
    sidePanelWorks: false,
  });
  assert.deepEqual(await disabled.response, {
    success: false,
    sidePanelWorks: true,
  });
  assert.deepEqual(await transition.response, {
    success: true,
    panelClosed: false,
  });
  assert.deepEqual(await malformedTransition.response, {
    success: true,
    panelClosed: false,
  });
  assert.deepEqual(transitions, [
    [42, openPopup],
    [undefined, openPopup],
  ]);
});

test("detached popup route responds only after the injected opener completes", async () => {
  const events: string[] = [];
  const capture = responseCapture();
  const route = createBackgroundSettingsMessageRouter({
    ...TEST_ENVIRONMENT,
    openPopupWindow: async () => {
      events.push("opened");
    },
  });

  assert.deepEqual(route({ type: "unrelated" }, () => {}), { handled: false });
  assert.deepEqual(route({ type: "openPopupWindow" }, capture.sendResponse), {
    handled: true,
    keepChannelOpen: true,
  });
  assert.deepEqual(await capture.response, { success: true });
  assert.deepEqual(events, ["opened"]);
});
