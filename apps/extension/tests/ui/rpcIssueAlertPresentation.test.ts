import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the RPC issue alert groups a compact chain action with its guidance", async () => {
  const source = await readFile(
    new URL("../../src/app/home/HomeAlerts.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /minW="auto"[\s\S]*?Dismiss/u);
  assert.match(
    source,
    /<HStack spacing=\{2\} align="center" minW=\{0\}>[\s\S]*?chainIds\.slice\(0, 1\)[\s\S]*?Balances may be stale/u,
  );
  assert.match(source, /Balances may be stale\.[\s\S]*?display="block"[\s\S]*?Check RPC settings\./u);
  assert.match(source, /h="26px"[\s\S]*?minH="26px"/u);
  assert.doesNotMatch(source, /<HStack flex=\{1\} minW=\{0\} spacing=\{1\} overflow="hidden">/u);
});
