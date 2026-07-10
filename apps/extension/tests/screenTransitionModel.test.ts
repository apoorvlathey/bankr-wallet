import assert from "node:assert/strict";
import test from "node:test";
import { getScreenTransitionPlan } from "../src/components/screenTransitionModel";

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
