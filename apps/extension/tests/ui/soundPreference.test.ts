import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  initializeSoundManager,
  saveSoundsEnabled,
} from "../../src/sounds/soundManager";

test("sound preference remounts with the latest in-session value", async () => {
  const originalChrome = globalThis.chrome;
  const localStorage: Record<string, unknown> = {
    soundsEnabled: true,
  };

  globalThis.chrome = {
    storage: {
      local: {
        get(key: string, callback: (value: Record<string, unknown>) => void) {
          callback({ [key]: localStorage[key] });
        },
        async set(values: Record<string, unknown>) {
          Object.assign(localStorage, values);
        },
      },
      onChanged: {
        addListener() {},
      },
    },
  } as unknown as typeof chrome;

  try {
    assert.equal(await initializeSoundManager(), true);

    await saveSoundsEnabled(false);

    assert.equal(localStorage.soundsEnabled, false);
    assert.equal(
      await initializeSoundManager(),
      false,
      "a remounted settings screen should receive the live preference",
    );
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("portfolio hover sound is shared by tabs, protocol links, and activity rows", async () => {
  const sources = await Promise.all(
    [
      "PortfolioTabs.tsx",
      "PortfolioDefiPositionRow.tsx",
      "Activity/ActivityItem.tsx",
    ].map((path) =>
      readFile(new URL(`../../src/components/${path}`, import.meta.url), "utf8"),
    ),
  );

  for (const source of sources) {
    assert.match(
      source,
      /onMouseEnter=\{\(\) =>\s*void playInteractionSound\("portfolioTokenHover"\)/,
    );
  }
});

test("portfolio tab clicks switch silently while retaining their hover cue", async () => {
  const [tabsSource, managerSource] = await Promise.all([
    readFile(
      new URL("../../src/components/PortfolioTabs.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/sounds/soundManager.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(managerSource, /portfolioTabSwitch/);
  assert.match(
    tabsSource,
    /if \(nextIndex === tabIndexRef\.current\) return;\s*selectTab\(nextIndex\);/,
  );
  assert.doesNotMatch(tabsSource, /playInteractionSound\("portfolioTabSwitch"\)/);
  assert.match(tabsSource, /onClick=\{\(\) => handleTabClick\(index\)\}/);
});
