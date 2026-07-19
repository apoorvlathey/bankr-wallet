import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../src/components/Settings/AddChain.tsx", import.meta.url),
  "utf8",
);

test("manual add-network setup starts at the RPC field", () => {
  assert.match(
    source,
    /<Input\s+autoFocus\s+placeholder="https:\/\/rpc\.example\.com"/u,
  );
});

test("manual add-network setup uses the amber commitment action", () => {
  assert.match(
    source,
    /primaryAction=\{[\s\S]*?<Button\s+variant="brand"[\s\S]*?>\s*Add network\s*<\/Button>/u,
  );
});
