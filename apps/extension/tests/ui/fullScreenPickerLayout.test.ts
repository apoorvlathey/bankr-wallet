import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("full-screen pickers use the wallet content measure on wide tabs", async () => {
  const picker = await readFile(
    new URL("../../src/components/ui/FullScreenPicker.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    picker,
    /<AppScreen ref=\{ref\} maxW="480px" mx="auto" \{\.\.\.rest\}>/u,
  );
  assert.match(picker, /labelTrailing\?: ReactNode/u);
  assert.match(picker, /labelTrailing && <Box minW=\{0\}>\{labelTrailing\}<\/Box>/u);
});
