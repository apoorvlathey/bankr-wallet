import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidBip32Path,
  resolveTemplate,
  withoutMasterPrefix,
} from "../../src/lib/bip32Path";

test("accepts supported Ethereum derivation path shapes", () => {
  for (const path of [
    "m/44'/60'/0'/0/0",
    "m/44'/60'/7'/0/0",
    "m/44'/60'/0'/0/12",
    "m/44'/60'/0'/12",
  ]) {
    assert.equal(isValidBip32Path(path), true, path);
  }
});

test("rejects malformed or out-of-range derivation paths", () => {
  for (const path of [
    "44'/60'/0'/0/0",
    "m/44'/60'//0",
    "m/44'/60'/-1/0",
    "m/44'/60'/2147483648/0",
    "m/044'/60'/0'/0/0",
    "m/44h/60h/0h/0/0",
  ]) {
    assert.equal(isValidBip32Path(path), false, path);
  }
});

test("resolves custom templates without allowing path injection", () => {
  assert.equal(
    resolveTemplate("m/44'/60'/0'/0/{index}", 9),
    "m/44'/60'/0'/0/9",
  );
  assert.equal(withoutMasterPrefix("m/44'/60'/0'/0/9"), "44'/60'/0'/0/9");
  assert.throws(() => resolveTemplate("m/44'/60'/0'/0/{index}/../1", 9));
  assert.throws(() => resolveTemplate("m/44'/60'/0'/0/{index}", 0x80000000));
});
