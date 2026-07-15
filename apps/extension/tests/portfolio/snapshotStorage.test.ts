import assert from "node:assert/strict";
import test from "node:test";
import {
  getSnapshots,
  recordSnapshot,
} from "../../src/chrome/portfolio/snapshotStorage";

test("portfolio snapshot V2 ignores and removes sentinel-era history", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const address = "0x00000000000000000000000000000000000000aa";
  const values: Record<string, unknown> = {
    portfolioSnapshots: {
      [address]: [{ timestamp: Date.now(), totalValueUsd: 4.24e69 }],
    },
  };

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: values[key] };
          },
          async set(update: Record<string, unknown>) {
            Object.assign(values, update);
          },
          async remove(key: string) {
            delete values[key];
          },
        },
      },
    },
  });
  t.after(() => {
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else Reflect.deleteProperty(globalThis, "chrome");
  });

  assert.deepEqual(await getSnapshots(address), []);
  assert.equal(values.portfolioSnapshots, undefined);

  await recordSnapshot(address, 42, { force: true });
  const snapshots = await getSnapshots(address);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].totalValueUsd, 42);
  assert.equal(typeof snapshots[0].timestamp, "number");
});
