import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Save contact uses the Warm Midnight amber commitment action", async () => {
  const editor = await readFile(
    new URL("../../src/components/shared/AddressContactEditorModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    editor,
    /<Button type="submit" variant="brand"[^>]*>Save contact<\/Button>/u,
  );
});
