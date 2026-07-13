// Exact WalletChan UI sender boundary.
import assert from "node:assert/strict";
import test from "node:test";

import { isTrustedWalletUiSender } from "../../src/chrome/trustedWalletUiSender";

const EXTENSION_ROOT = "chrome-extension://walletchan-test/";

function sender(
  url: string,
  frameId: number | undefined = 0,
): chrome.runtime.MessageSender {
  return { url, frameId };
}

test("only WalletChan UI documents are trusted as wallet message senders", () => {
  for (const page of [
    "index.html",
    "index.html?mode=sidepanel#/settings",
    "onboarding.html",
    "onboarding.html#/import",
  ]) {
    assert.equal(
      isTrustedWalletUiSender(sender(`${EXTENSION_ROOT}${page}`), EXTENSION_ROOT),
      true,
      page,
    );
  }

  // These pages are web-accessible and therefore have only the narrow ENS
  // capabilities authorized by ensBrowsing/handlers.ts.
  for (const page of [
    "browse.html",
    "interstitial.html#https://example.eth/",
    "ens-error.html?name=example.eth",
    "setup-kubo.html",
    "popup-init.html",
  ]) {
    assert.equal(
      isTrustedWalletUiSender(sender(`${EXTENSION_ROOT}${page}`), EXTENSION_ROOT),
      false,
      page,
    );
  }
});

test("wallet UI trust rejects embedded, lookalike, and foreign senders", () => {
  assert.equal(
    isTrustedWalletUiSender(sender(`${EXTENSION_ROOT}index.html`, 2), EXTENSION_ROOT),
    false,
  );
  assert.equal(
    isTrustedWalletUiSender(
      sender(`${EXTENSION_ROOT}index.html.evil`),
      EXTENSION_ROOT,
    ),
    false,
  );
  assert.equal(
    isTrustedWalletUiSender(
      sender("https://attacker.example/index.html"),
      EXTENSION_ROOT,
    ),
    false,
  );
  assert.equal(
    isTrustedWalletUiSender(
      sender("moz-extension://different/index.html"),
      EXTENSION_ROOT,
    ),
    false,
  );
  assert.equal(isTrustedWalletUiSender({}, EXTENSION_ROOT), false);
});

test("wallet UI trust is scheme-agnostic for Firefox extension URLs", () => {
  const firefoxRoot = "moz-extension://walletchan-test/";
  assert.equal(
    isTrustedWalletUiSender(
      sender(`${firefoxRoot}index.html#/accounts`),
      firefoxRoot,
    ),
    true,
  );
});
