import assert from "node:assert/strict";
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
