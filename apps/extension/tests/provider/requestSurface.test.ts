import assert from "node:assert/strict";
import test from "node:test";

import { shouldRequestFullscreenTransactionSidePanel } from "../../src/chrome/provider/contentBridge/requestSurface";
import {
  FULLSCREEN_REQUEST_NOTIFICATION_PREFIX,
  fullscreenRequestNotificationWindowId,
} from "../../src/chrome/windowing/providerRequestSurface";

test("only an active fullscreen transaction gesture uses the early panel hop", () => {
  assert.equal(
    shouldRequestFullscreenTransactionSidePanel(
      "i_sendTransaction",
      true,
      true,
    ),
    true,
  );
  assert.equal(
    shouldRequestFullscreenTransactionSidePanel(
      "i_sendTransaction",
      false,
      true,
    ),
    false,
  );
  assert.equal(
    shouldRequestFullscreenTransactionSidePanel(
      "i_sendTransaction",
      true,
      false,
    ),
    false,
  );
  assert.equal(
    shouldRequestFullscreenTransactionSidePanel(
      "i_signatureRequest",
      true,
      true,
    ),
    false,
  );
});

test("fullscreen request notification ids carry only a valid browser window id", () => {
  assert.equal(
    fullscreenRequestNotificationWindowId(
      `${FULLSCREEN_REQUEST_NOTIFICATION_PREFIX}42`,
    ),
    42,
  );
  assert.equal(fullscreenRequestNotificationWindowId("unrelated"), null);
  assert.equal(
    fullscreenRequestNotificationWindowId(
      `${FULLSCREEN_REQUEST_NOTIFICATION_PREFIX}-1`,
    ),
    null,
  );
});
