import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readWalletConnectModule = (name: string) =>
  readFile(
    new URL(`../../src/chrome/walletConnect/${name}`, import.meta.url),
    "utf8",
  );

test("WalletConnect implementation has one audit folder and no root family", async () => {
  const rootEntries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  assert.deepEqual(
    rootEntries
      .filter(
        (entry) =>
          entry.isFile() && /^walletConnect.*\.ts$/.test(entry.name),
      )
      .map((entry) => entry.name),
    [],
  );

  const domainEntries = await readdir(
    new URL("../../src/chrome/walletConnect/", import.meta.url),
    { withFileTypes: true },
  );
  for (const entry of domainEntries.filter(
    (candidate) => candidate.isFile() && candidate.name.endsWith(".ts"),
  )) {
    const source = await readWalletConnectModule(entry.name);
    assert.ok(
      source.split(/\r?\n/).length <= 400,
      `${entry.name} exceeds the WalletConnect audit ceiling`,
    );
  }
});

test("WalletConnect composition keeps storage, protocol, request, and SDK direction one-way", async () => {
  const [storage, protocol, pending, router, client, commands, bridge] =
    await Promise.all([
      readWalletConnectModule("storage.ts"),
      readWalletConnectModule("protocol.ts"),
      readWalletConnectModule("pendingRequests.ts"),
      readWalletConnectModule("requestRouter.ts"),
      readWalletConnectModule("client.ts"),
      readWalletConnectModule("sessionCommands.ts"),
      readWalletConnectModule("resultBridge.ts"),
    ]);

  assert.doesNotMatch(storage, /@reown\/walletkit|@walletconnect\/core/);
  assert.match(protocol, /from ["'].\/storage["']/);
  assert.doesNotMatch(protocol, /from ["'].\/(?:client|sessionCommands)["']/);
  assert.match(router, /from ["'].\/pendingRequests["']/);
  assert.doesNotMatch(router, /savePendingTxRequest|savePendingSignatureRequest/);
  assert.doesNotMatch(pending, /@reown\/walletkit|@walletconnect\/core/);
  assert.doesNotMatch(client, /from ["'].\/(?:sessionCommands|resultBridge)["']/);
  assert.match(commands, /from ["'].\/client["']/);
  assert.match(bridge, /from ["'].\/client["']/);
});

test("background composes WalletConnect client and commands without a root shim", async () => {
  const background = (
    await Promise.all([
      readFile(
        new URL("../../src/chrome/background/composition/accountRoutes.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../src/chrome/background/composition/dataRoutes.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../src/chrome/background/composition/lifecycle.ts", import.meta.url),
        "utf8",
      ),
    ])
  ).join("\n");
  assert.match(background, /walletConnect\/client["']/);
  assert.match(background, /walletConnect\/sessionCommands["']/);
  assert.match(background, /walletConnect\/storage["']/);
  assert.doesNotMatch(
    background,
    /from ["']\.\.\/\.\.\/walletConnect[A-Z][^"']*["']/,
  );
});
