import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../src/components/AddTokenScreen.tsx", import.meta.url),
  "utf8",
);

test("manual add-token uses the amber commitment action", () => {
  assert.match(
    source,
    /<Button[\s\S]*?form="add-token-form"[\s\S]*?variant="brand"[\s\S]*?>[\s\S]*?\{saveLabel\}[\s\S]*?<\/Button>/u,
  );
});
