import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createScreenAnimationCompletionGate } from "../../src/components/screenAnimationCompletionGate";
import { getScreenTransitionPlan } from "../../src/components/screenTransitionModel";

test("deeper hierarchy pushes forward horizontally", () => {
  assert.deepEqual(
    getScreenTransitionPlan(
      { kind: "slide", depth: 0 },
      { kind: "slide", depth: 1 },
    ),
    { direction: "forward", kind: "slide" },
  );
});
test("shallower or sibling hierarchy reveals the destination by going back", () => {
  assert.deepEqual(
    getScreenTransitionPlan(
      { kind: "slide", depth: 2 },
      { kind: "slide", depth: 1 },
    ),
    { direction: "back", kind: "slide" },
  );
  assert.deepEqual(
    getScreenTransitionPlan(
      { kind: "slide", depth: 1 },
      { kind: "slide", depth: 1 },
    ),
    { direction: "back", kind: "slide" },
  );
});

test("auth and root changes use a fade regardless of depth", () => {
  assert.deepEqual(
    getScreenTransitionPlan(
      { kind: "slide", depth: 1 },
      { kind: "fade", depth: 0 },
    ),
    { direction: "forward", kind: "fade" },
  );
});

test("back navigation ignores stale completion from the resting screen layer", () => {
  const gate = createScreenAnimationCompletionGate();
  const restingDefinition = { x: "0%" };
  const exitDefinition = { x: "100%" };

  assert.equal(gate.consumeDelay(7, restingDefinition, 200, 10), null);
  gate.start(7, exitDefinition, 10);
  assert.equal(gate.consumeDelay(7, restingDefinition, 200, 10), null);
  assert.equal(gate.consumeDelay(7, exitDefinition, 200, 10), 200);
  assert.equal(gate.consumeDelay(7, exitDefinition, 200, 210), null);

  gate.start(8, exitDefinition, 10);
  assert.equal(gate.consumeDelay(8, exitDefinition, 200, 210), 0);
});

test("the screen stack starts and consumes the completion gate around Framer callbacks", async () => {
  const source = await readFile(
    new URL("../../src/components/ScreenTransition.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /onAnimationStart=/);
  assert.match(source, /completionGateRef\.current\.start\(layer\.key, definition\)/);
  assert.match(source, /completionGateRef\.current\.consumeDelay\(/);
  assert.match(source, /duration \* 1_000/);
});

test("back navigation restores the beneath layer before the exit settles", async () => {
  const source = await readFile(
    new URL("../../src/components/ScreenTransition.tsx", import.meta.url),
    "utf8",
  );
  const preRevealRestore = source.indexOf("restoreScroll(saved.scrollTop, state.beneathKey)");
  const exitSettlement = source.indexOf("const onAboveSettled");

  assert.ok(preRevealRestore >= 0);
  assert.ok(preRevealRestore < exitSettlement);
  assert.doesNotMatch(source, /restoreDestinationFocus[\s\S]*restoreScroll/);
});
