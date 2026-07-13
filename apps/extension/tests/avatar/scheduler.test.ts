import assert from "node:assert/strict";
import test from "node:test";

import {
  getAvatarImageCacheEpoch,
  invalidateAvatarImageCacheForWalletReset,
  scheduleAvatarImageFetch,
  trackAvatarImageFetchController,
} from "../../src/chrome/avatar/scheduler";
import { deferred } from "./runtime";

test("avatar scheduler runs two jobs and releases queued work FIFO", async () => {
  invalidateAvatarImageCacheForWalletReset();
  const epoch = getAvatarImageCacheEpoch();
  const starts: string[] = [];
  const gates = [deferred(), deferred(), deferred()];
  const jobs = ["first", "second", "third"].map((name, index) =>
    scheduleAvatarImageFetch(`https://${name}.example/avatar`, epoch, async () => {
      starts.push(name);
      await gates[index]!.promise;
      return name;
    }),
  );
  await Promise.resolve();
  assert.deepEqual(starts, ["first", "second"]);
  gates[0]!.resolve();
  assert.equal(await jobs[0], "first");
  await Promise.resolve();
  assert.deepEqual(starts, ["first", "second", "third"]);
  gates[1]!.resolve();
  gates[2]!.resolve();
  assert.deepEqual(await Promise.all(jobs.slice(1)), ["second", "third"]);
});

test("avatar scheduler shares one operation for the same URL", async () => {
  const epoch = getAvatarImageCacheEpoch();
  const gate = deferred();
  let operations = 0;
  const operation = async () => {
    operations += 1;
    await gate.promise;
    return "data:image/webp;base64,AQ==";
  };
  const first = scheduleAvatarImageFetch("https://same.example/a", epoch, operation);
  const second = scheduleAvatarImageFetch("https://same.example/a", epoch, operation);
  assert.equal(first, second);
  gate.resolve();
  assert.equal(await first, "data:image/webp;base64,AQ==");
  assert.equal(operations, 1);
});

test("wallet reset aborts active controllers and skips old queued operations", async () => {
  const epoch = getAvatarImageCacheEpoch();
  const firstGate = deferred();
  const secondGate = deferred();
  let queuedRan = false;
  const first = scheduleAvatarImageFetch("https://one.example/a", epoch, async () => {
    await firstGate.promise;
    return "first";
  });
  const second = scheduleAvatarImageFetch("https://two.example/a", epoch, async () => {
    await secondGate.promise;
    return "second";
  });
  const queued = scheduleAvatarImageFetch("https://three.example/a", epoch, async () => {
    queuedRan = true;
    return "third";
  });
  await Promise.resolve();

  const controller = new AbortController();
  trackAvatarImageFetchController(controller);
  invalidateAvatarImageCacheForWalletReset();
  assert.equal(controller.signal.aborted, true);
  firstGate.resolve();
  secondGate.resolve();
  assert.deepEqual(await Promise.all([first, second, queued]), ["first", "second", null]);
  assert.equal(queuedRan, false);
});

test("avatar scheduler converts unexpected operation failures to null", async () => {
  const epoch = getAvatarImageCacheEpoch();
  assert.equal(
    await scheduleAvatarImageFetch("https://error.example/a", epoch, async () => {
      throw new Error("decoder failure");
    }),
    null,
  );
});
