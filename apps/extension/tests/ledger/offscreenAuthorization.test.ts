import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedLedgerBackgroundSender } from "../../src/offscreen/messageAuthorization";

const extensionRoot = "chrome-extension://walletchan/";
const extensionId = "walletchan";

test("Ledger offscreen accepts only the exact extension service worker", () => {
  assert.equal(
    isTrustedLedgerBackgroundSender(
      {
        id: extensionId,
        url: `${extensionRoot}static/js/background.js`,
      },
      extensionRoot,
      extensionId,
    ),
    true,
  );
});

test("Ledger offscreen rejects content scripts, UI pages, and lookalikes", () => {
  const rejected: chrome.runtime.MessageSender[] = [
    {
      id: extensionId,
      url: `${extensionRoot}static/js/background.js`,
      tab: { id: 7 } as chrome.tabs.Tab,
    },
    { id: extensionId, url: `${extensionRoot}index.html` },
    { id: extensionId, url: `${extensionRoot}static/js/background.js?fake=1` },
    { id: "other-extension", url: `${extensionRoot}static/js/background.js` },
    { id: extensionId, url: "https://example.test/static/js/background.js" },
    { id: extensionId },
  ];

  for (const sender of rejected) {
    assert.equal(
      isTrustedLedgerBackgroundSender(sender, extensionRoot, extensionId),
      false,
    );
  }
});
