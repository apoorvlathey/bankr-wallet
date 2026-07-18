import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createDappChainSwitchNotificationHandler } from "../../src/chrome/background/chainSwitchNotification";

test("every bundled SVG chain icon has a notification-safe PNG", () => {
  const chainIconDirectory = fileURLToPath(
    new URL("../../public/chainIcons/", import.meta.url),
  );
  const notificationIconDirectory = fileURLToPath(
    new URL("../../public/notificationChainIcons/", import.meta.url),
  );

  for (const filename of readdirSync(chainIconDirectory)) {
    if (!filename.endsWith(".svg")) continue;
    assert.equal(
      existsSync(
        `${notificationIconDirectory}/${filename.replace(/\.svg$/, ".png")}`,
      ),
      true,
      `Missing notification raster for ${filename}`,
    );
  }
});

test("chain-switch validation fails before portfolio or notification effects", async () => {
  let effects = 0;
  const handler = createDappChainSwitchNotificationHandler({
    getNetworksInfo: async () => ({}),
    getResolvedChainById: () => null,
    sendRuntimeMessage: async () => {
      effects += 1;
    },
    showNotification: async () => {
      effects += 1;
    },
    getRuntimeUrl: (path) => path,
    now: () => 1,
  });
  assert.deepEqual(await handler({ chainId: 0 }, {}), {
    success: false,
    error: "Invalid chain ID",
  });
  assert.deepEqual(
    await handler({ chainId: 8453 }, {} as chrome.runtime.MessageSender),
    { success: false, error: "Missing tab context" },
  );
  assert.deepEqual(
    await handler(
      { chainId: 8453 },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
    ),
    { success: false, error: "Unknown chain" },
  );
  assert.equal(effects, 0);
});

test("portfolio relinking bypasses notification cooldown while notification does not", async () => {
  const runtimeMessages: unknown[] = [];
  const notifications: unknown[][] = [];
  let now = 1_000;
  const handler = createDappChainSwitchNotificationHandler({
    getNetworksInfo: async () => ({ Base: { chainId: 8453 } }),
    getResolvedChainById: (chainId) => ({
      chainId,
      name: "Base",
      icon: "/chainIcons/base.svg",
    }),
    sendRuntimeMessage: async (message) => {
      runtimeMessages.push(message);
    },
    showNotification: async (...args) => {
      notifications.push(args);
    },
    getRuntimeUrl: (path) => `chrome-extension://wallet/${path.replace(/^\//, "")}`,
    now: () => now,
  });
  const sender = {
    origin: "https://app.example",
    url: "https://app.example/page",
    tab: { id: 12, url: "https://app.example/page" },
  } as chrome.runtime.MessageSender;

  assert.deepEqual(await handler({ chainId: "8453" }, sender), {
    success: true,
  });
  now = 2_000;
  assert.deepEqual(await handler({ chainId: 8453 }, sender), {
    success: true,
    skipped: true,
  });
  assert.deepEqual(runtimeMessages, [
    { type: "portfolioDappChainChanged", tabId: 12, chainId: 8453 },
    { type: "portfolioDappChainChanged", tabId: 12, chainId: 8453 },
  ]);
  assert.deepEqual(notifications, [
    [
      "chain-switch-12-8453-1000",
      "Switched to Base",
      "app.example switched WalletChan network",
      {
        iconUrl:
          "chrome-extension://wallet/notificationChainIcons/base.png",
      },
    ],
  ]);
});

test("raster notification icons remain on their original bundled path", async () => {
  let options: unknown;
  const handler = createDappChainSwitchNotificationHandler({
    getNetworksInfo: async () => ({}),
    getResolvedChainById: () => ({
      chainId: 46630,
      name: "Robinhood Chain",
      icon: "/chainIcons/robinhood.webp",
    }),
    sendRuntimeMessage: async () => undefined,
    showNotification: async (_id, _title, _message, received) => {
      options = received;
    },
    getRuntimeUrl: (path) =>
      `chrome-extension://wallet/${path.replace(/^\//, "")}`,
    now: () => 5_000,
  });
  await handler(
    { chainId: 46630 },
    { tab: { id: 3 }, url: "https://app.example" } as chrome.runtime.MessageSender,
  );
  assert.deepEqual(options, {
    iconUrl: "chrome-extension://wallet/chainIcons/robinhood.webp",
  });
});

test("remote notification icons are never loaded", async () => {
  let options: unknown;
  const handler = createDappChainSwitchNotificationHandler({
    getNetworksInfo: async () => ({}),
    getResolvedChainById: () => ({
      chainId: 1,
      name: "Ethereum",
      icon: "https://tracker.example/icon.svg",
    }),
    sendRuntimeMessage: async () => undefined,
    showNotification: async (_id, _title, _message, received) => {
      options = received;
    },
    getRuntimeUrl: (path) => `chrome-extension://wallet/${path}`,
    now: () => 5_000,
  });
  await handler(
    { chainId: 1 },
    { tab: { id: 3 }, url: "not a URL" } as chrome.runtime.MessageSender,
  );
  assert.deepEqual(options, { iconUrl: undefined });
});
