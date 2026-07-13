import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNativeValueCompact,
  parseTransactionValueWei,
} from "../../src/components/TransactionConfirmation/transactionValue";

test("transaction value parsing accepts decimal and hexadecimal quantities", () => {
  assert.deepEqual(parseTransactionValueWei("1000000000000000000"), {
    ok: true,
    wei: 1_000_000_000_000_000_000n,
  });
  assert.deepEqual(parseTransactionValueWei("0xde0b6b3a7640000"), {
    ok: true,
    wei: 1_000_000_000_000_000_000n,
  });
  assert.deepEqual(parseTransactionValueWei(undefined), { ok: true, wei: 0n });
});

test("transaction value parsing keeps malformed or negative input visible", () => {
  assert.deepEqual(parseTransactionValueWei("not-a-quantity"), {
    ok: false,
    raw: "not-a-quantity",
  });
  assert.deepEqual(parseTransactionValueWei("-1"), { ok: false, raw: "-1" });
});

test("compact native values retain useful precision", () => {
  assert.equal(formatNativeValueCompact(0n, "ETH"), "0 ETH");
  assert.equal(formatNativeValueCompact(1n, "ETH"), "<0.000001 ETH");
  assert.equal(
    formatNativeValueCompact(1_234_567_890_000_000_000n, "ETH"),
    "1.234567 ETH",
  );
});
