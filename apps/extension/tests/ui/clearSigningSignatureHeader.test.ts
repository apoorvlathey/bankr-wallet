import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("clear signing hides descriptor-owner attribution for signatures", async () => {
  const implementation = await readFile(
    new URL(
      "../../src/components/ClearSigning/ClearSigningView.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    implementation,
    /props\.kind === "calldata" && state\.ownerName/u,
  );
  assert.match(implementation, /via \{state\.ownerName\}/u);
});
