import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("signature Reject all reaches the global combined-queue handler", async () => {
  const [app, facade, implementation, screen] = await Promise.all([
    readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../src/components/SignatureRequestConfirmation.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/SignatureConfirmation/SignatureRequestConfirmation.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../src/components/SignatureConfirmation/SignatureConfirmationScreen.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(
    app,
    /<SignatureRequestConfirmation[\s\S]*?onRejectAll=\{handleRejectAll\}/u,
  );
  assert.match(
    implementation,
    /<SignatureConfirmationScreen[\s\S]*?onRejectAll=\{onRejectAll\}/u,
  );
  assert.match(
    screen,
    /<QueueNavigation[\s\S]*?onRejectAll=\{onRejectAll\}/u,
  );
  assert.match(
    facade,
    /export \{ default \} from "\.\/SignatureConfirmation\/SignatureRequestConfirmation"/u,
  );
  assert.doesNotMatch(app, /handleCancelAllSignatures/u);
});
