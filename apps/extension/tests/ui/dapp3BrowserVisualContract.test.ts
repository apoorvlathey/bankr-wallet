import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PAGE_ROOT = new URL("../../src/pages/", import.meta.url);
const COMPONENT_ROOT = new URL("../../src/components/Dapp3Browser/", import.meta.url);

test("browser search and logo contrast follow the released visual contract", async () => {
  const page = await readFile(new URL("Dapp3Browser.tsx", PAGE_ROOT), "utf8");
  const css = await readFile(new URL("Dapp3Browser.css", PAGE_ROOT), "utf8");

  assert.match(page, /\{targetInput && \(/);
  assert.match(page, /className="search-clear"/);
  assert.match(page, /aria-label="Clear search"/);
  assert.match(page, /setTargetInput\(""\)/);
  assert.match(css, /\.brand-mark \{[\s\S]*background: rgba\(255, 255, 255, 0\.92\)/);
  assert.match(css, /\.site-icon \{[\s\S]*background: rgba\(255, 255, 255, 0\.92\)/);
  assert.match(css, /\.site-favicon \{[\s\S]*width: 32px;[\s\S]*border-radius: 7px/);
});

test("browser bookmark reminder stays corner-pinned and dismissible", async () => {
  const reminder = await readFile(
    new URL("BookmarkPageReminder.tsx", COMPONENT_ROOT),
    "utf8",
  );
  const css = await readFile(new URL("Dapp3Browser.css", PAGE_ROOT), "utf8");

  assert.match(reminder, /walletchan:browseBookmarkReminderDismissed:v1/);
  assert.match(reminder, /localStorage\.setItem/);
  assert.match(reminder, /aria-label="Dismiss bookmark reminder"/);
  assert.match(css, /\.bookmark-reminder \{[\s\S]*position: fixed;/);
  assert.match(
    css,
    /\.bookmark-reminder:hover \.bookmark-reminder-dismiss/,
  );
});
