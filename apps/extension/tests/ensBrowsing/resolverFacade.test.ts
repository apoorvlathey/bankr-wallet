import assert from "node:assert/strict";
import test from "node:test";

import {
  isGweiName,
  resolveContractAddress,
  resolveEns,
  resolveGwei,
} from "../../src/chrome/ensBrowsing/resolver";

test("resolver facade recognizes only fully-qualified .gwei names", () => {
  assert.equal(isGweiName("site.gwei"), true);
  assert.equal(isGweiName("Sub.Site.GWEI."), true);
  assert.equal(isGweiName("site.eth"), false);
  assert.equal(isGweiName("gwei"), false);
});

test("resolver facade rejects malformed names and addresses before egress", async () => {
  assert.deepEqual(await resolveEns("site.example"), {
    ok: false,
    error: "Not a .eth name: site.example",
  });
  assert.deepEqual(await resolveGwei("site.eth"), {
    ok: false,
    error: "Not a .gwei name: site.eth",
  });
  assert.deepEqual(await resolveContractAddress("0x1234"), {
    ok: false,
    error: "Not a contract address: 0x1234",
  });
});
