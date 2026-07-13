import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { WalletConnectPay } from "../../src/chrome/walletConnect/payUnavailable";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = path.resolve(HERE, "..", "..");

test("WalletConnect Pay is fail-closed in the extension runtime", () => {
  assert.equal(WalletConnectPay.isAvailable(), false);
  assert.throws(
    () => new WalletConnectPay(),
    /WalletConnect Pay is unavailable in WalletChan/,
  );
});

test("the background bundle aliases the optional Pay package to the CSP-safe shim", () => {
  const config = fs.readFileSync(
    path.join(EXTENSION_ROOT, "vite.config.background.ts"),
    "utf8",
  );
  const shim = fs.readFileSync(
    path.join(
      EXTENSION_ROOT,
      "src/chrome/walletConnect/payUnavailable.ts",
    ),
    "utf8",
  );
  const executableShim = shim.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(config, /["']@walletconnect\/pay["']\s*:/);
  assert.match(config, /walletConnect\/payUnavailable\.ts/);
  assert.doesNotMatch(executableShim, /\beval\s*\(/);
  assert.doesNotMatch(executableShim, /\bnew\s+Function\b/);
  assert.doesNotMatch(executableShim, /\bWebAssembly\b/);
});
