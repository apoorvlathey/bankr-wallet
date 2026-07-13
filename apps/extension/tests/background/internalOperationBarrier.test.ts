import assert from "node:assert/strict";
import test from "node:test";

import { createInternalIrreversibleOperationRunner } from "../../src/chrome/background/internalOperationBarrier";

test("internal effects receive unique reset-visible confirmation claims", async () => {
  const claims: any[] = [];
  let nextId = 0;
  const conflictCalls: unknown[] = [];
  const run = createInternalIrreversibleOperationRunner({
    createRequestId: () => `internal-${++nextId}`,
    pendingResolutionConflict: (action) => {
      conflictCalls.push(action);
      return { success: false, error: `blocked:${action}` };
    },
    runPendingRequestResolution: async (options: any) => {
      claims.push(options);
      return options.resolve();
    },
  });

  assert.equal(await run(async () => "swap"), "swap");
  assert.equal(await run(async () => "sponsored"), "sponsored");
  assert.deepEqual(
    claims.map(({ family, requestId, action }) => ({
      family,
      requestId,
      action,
    })),
    [
      {
        family: "internalOperation",
        requestId: "internal-1",
        action: "confirm",
      },
      {
        family: "internalOperation",
        requestId: "internal-2",
        action: "confirm",
      },
    ],
  );
  assert.deepEqual(claims[0].conflictResult("reset"), {
    success: false,
    error: "blocked:reset",
  });
  assert.deepEqual(conflictCalls, ["reset"]);
});
