import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getBatchEncodingBlockedReason } from "../../src/components/BatchConfirmation/helpers";
import { getSmartExpandedCalls } from "../../src/components/BatchConfirmation/useBatchReviewState";
import { createPreviewBatchScenario } from "../../src/preview/fixtures";

test("smart batch call expansion opens only single-call requests", () => {
  assert.deepEqual([...getSmartExpandedCalls(0)], []);
  assert.deepEqual([...getSmartExpandedCalls(1)], [0]);
  assert.deepEqual([...getSmartExpandedCalls(2)], []);
  assert.deepEqual([...getSmartExpandedCalls(100)], []);
});

test("unsafe batch confirmation explains the corrective action on the button", async () => {
  const [contextSource, actionSource, screenSource, confirmButtonSource] = await Promise.all([
    readFile(
      new URL(
        "../../src/components/BatchConfirmation/RequestContext.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/BatchConfirmation/ConfirmationActions.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/BatchConfirmation/BatchTransactionConfirmation.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/RequestConfirmation/SimulationFailureConfirmButton.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(contextSource, /Confirm unavailable:/);
  assert.match(actionSource, /disabledReason=\{confirmDisabledReason\}/);
  assert.match(actionSource, /isDisabled=\{submitting\}/);
  assert.doesNotMatch(actionSource, /disabled\?: boolean/);
  assert.doesNotMatch(screenSource, /disabled=\{isIntakeValidating\}/);
  assert.match(confirmButtonSource, /role=\{disabledReason \? "group" : undefined\}/);
  assert.match(
    confirmButtonSource,
    /tabIndex=\{disabledReason && !isLoading \? 0 : undefined\}/,
  );
  assert.equal(
    getBatchEncodingBlockedReason(
      "Call 1 targets your own account with payload — rejected to prevent ERC-7821 self-recursion",
    ),
    "WalletChan blocked this batch because the call targeting your own account could bypass authorization. Remove or edit that call to continue.",
  );

  const unsafePreview = createPreviewBatchScenario("bankr", "unsafe-self-call");
  assert.equal(unsafePreview.params.calls[0].to, unsafePreview.params.from);
  assert.notEqual(unsafePreview.params.calls[0].data, "0x");
});
