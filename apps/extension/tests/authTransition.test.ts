import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthCeremonyEpoch,
  invalidateAuthCeremonies,
  isCurrentAuthCeremonyEpoch,
  runSerializedAuthTransition,
} from "../src/chrome/authTransition";

test("auth ceremony epochs invalidate stale WebAuthn work", () => {
  const initial = getAuthCeremonyEpoch();
  assert.equal(isCurrentAuthCeremonyEpoch(initial), true);

  const next = invalidateAuthCeremonies();
  assert.notEqual(next, initial);
  assert.equal(isCurrentAuthCeremonyEpoch(initial), false);
  assert.equal(isCurrentAuthCeremonyEpoch(next), true);
});

test("auth transitions execute in message arrival order", async () => {
  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = runSerializedAuthTransition(async () => {
    order.push("first:start");
    await firstGate;
    order.push("first:end");
  });
  const second = runSerializedAuthTransition(async () => {
    order.push("second:start");
    order.push("second:end");
  });

  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, ["first:start"]);

  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, [
    "first:start",
    "first:end",
    "second:start",
    "second:end",
  ]);
});

test("a failed auth transition cannot wedge the queue", async () => {
  await assert.rejects(
    runSerializedAuthTransition(async () => {
      throw new Error("expected failure");
    }),
    /expected failure/,
  );

  const result = await runSerializedAuthTransition(async () => "continued");
  assert.equal(result, "continued");
});
