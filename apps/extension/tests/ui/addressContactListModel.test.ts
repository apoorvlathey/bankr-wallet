import assert from "node:assert/strict";
import test from "node:test";
import { mergeReorderedContactSubset } from "../../src/components/shared/addressContactListModel";

test("contact subset reordering preserves excluded contacts in their saved slots", () => {
  const all = ["0xA", "0xB", "0xC", "0xD"];

  assert.deepEqual(
    mergeReorderedContactSubset(all, ["0xA", "0xC", "0xD"], ["0xD", "0xA", "0xC"]),
    ["0xD", "0xB", "0xA", "0xC"],
  );
});

test("contact subset reordering fails closed for a non-permutation", () => {
  const all = ["0xA", "0xB", "0xC"];

  assert.deepEqual(
    mergeReorderedContactSubset(all, ["0xA", "0xC"], ["0xA", "0xD"]),
    all,
  );
  assert.deepEqual(
    mergeReorderedContactSubset(all, ["0xA", "0xC"], ["0xA"]),
    all,
  );
  assert.deepEqual(
    mergeReorderedContactSubset(all, ["0xA", "0xC"], ["0xA", "0xA"]),
    all,
  );
});
