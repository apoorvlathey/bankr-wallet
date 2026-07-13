import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChromeModule = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("local-signing root clutter is limited to the stable facade", async () => {
  const entries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  assert.deepEqual(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          /^local(?:Signer|TransactionBroadcast|TransactionSigner|MessageSigner|PrivateKey)/.test(
            entry.name,
          ),
      )
      .map((entry) => entry.name)
      .sort(),
    ["localSigner.ts"],
  );
  assert.match(await readChromeModule("localSigning/README.md"), /effect order/);
});

test("local signing keeps policy, RPC effects, and key helpers one-way", async () => {
  const [facade, client, broadcast, transaction, message, key] =
    await Promise.all([
      readChromeModule("localSigner.ts"),
      readChromeModule("localSigning/client.ts"),
      readChromeModule("localSigning/transactionBroadcast.ts"),
      readChromeModule("localSigning/transactionSigner.ts"),
      readChromeModule("localSigning/messageSigner.ts"),
      readChromeModule("localSigning/privateKey.ts"),
    ]);

  assert.match(facade, /Stable compatibility facade/);
  assert.doesNotMatch(facade, /\b(?:async )?function\b|chrome\.|createWalletClient/);
  assert.doesNotMatch(
    client,
    /from ["'].\/(?:transactionBroadcast|transactionSigner|messageSigner)["']/,
  );
  assert.doesNotMatch(client, /withStorageLock|signTransaction|signMessage/);
  assert.doesNotMatch(broadcast, /privateKeyToAccount|createWalletClient/);
  assert.match(transaction, /from ["'].\/transactionBroadcast["']/);
  assert.doesNotMatch(message, /chrome\.|secureHttpTransport|withStorageLock/);
  assert.doesNotMatch(key, /chrome\.|secureHttpTransport|withStorageLock/);
});

test("local signer facade preserves every runtime implementation identity", async () => {
  const [facade, broadcast, transaction, message, key] = await Promise.all([
    import("../../src/chrome/localSigner"),
    import("../../src/chrome/localSigning/transactionBroadcast"),
    import("../../src/chrome/localSigning/transactionSigner"),
    import("../../src/chrome/localSigning/messageSigner"),
    import("../../src/chrome/localSigning/privateKey"),
  ]);

  for (const implementation of [broadcast, transaction, message, key]) {
    for (const [name, value] of Object.entries(implementation)) {
      assert.equal(facade[name], value, name);
    }
  }
});
