import assert from "node:assert/strict";
import test from "node:test";

import { validateWalletSendCallsPayload } from "../../src/chrome/provider/batchValidation";
import { parseProviderChainId } from "../../src/chrome/provider/chainBoundary";
import { makeProviderError, prefixWalletError } from "../../src/chrome/provider/errors";
import {
  MAX_BATCH_CALLS,
  MAX_HEX_DATA_CHARS,
  MAX_PROVIDER_REQUEST_CHARS,
  MAX_PROVIDER_URL_CHARS,
  MAX_RPC_PARAMS_CHARS,
  MAX_SIGNATURE_PAYLOAD_CHARS,
  serializedJsonLength,
} from "../../src/chrome/provider/limits";
import { validateExternalProviderMessage } from "../../src/chrome/provider/messageValidation";
import { isProviderRequestId } from "../../src/chrome/provider/primitives";

const ADDRESS = "0x0000000000000000000000000000000000000001";

test("provider resource ceilings stay frozen", () => {
  assert.equal(MAX_PROVIDER_REQUEST_CHARS, 1_000_000);
  assert.equal(MAX_HEX_DATA_CHARS, 262_146);
  assert.equal(MAX_SIGNATURE_PAYLOAD_CHARS, 524_288);
  assert.equal(MAX_RPC_PARAMS_CHARS, 524_288);
  assert.equal(MAX_BATCH_CALLS, 100);
  assert.equal(MAX_PROVIDER_URL_CHARS, 2_048);

  assert.equal(isProviderRequestId("x".repeat(128)), true);
  assert.equal(isProviderRequestId("x".repeat(129)), false);
  assert.equal(serializedJsonLength({ ok: true }), 11);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(serializedJsonLength(cyclic), null);
});

test("provider parsing does not invoke hostile coercion hooks", () => {
  let coerced = false;
  const hostile = {
    [Symbol.toPrimitive]() {
      coerced = true;
      throw new Error("must not run");
    },
    toString() {
      coerced = true;
      throw new Error("must not run");
    },
  };

  assert.equal(parseProviderChainId(hostile), null);
  assert.equal(isProviderRequestId(hostile), false);
  assert.equal(
    validateExternalProviderMessage({
      type: "dappChainSwitchNotification",
      chainId: hostile,
    }).valid,
    false,
  );
  assert.equal(coerced, false);
});

test("batch caps are enforced again at the shared intake boundary", () => {
  const call = { to: ADDRESS, data: "0x" };
  assert.deepEqual(
    validateWalletSendCallsPayload({
      calls: Array.from({ length: MAX_BATCH_CALLS }, () => call),
    }),
    { valid: true },
  );
  assert.match(
    validateWalletSendCallsPayload({
      calls: Array.from({ length: MAX_BATCH_CALLS + 1 }, () => call),
    }).error ?? "",
    /call count/i,
  );
});

test("EIP-1193 errors retain exact codes and one WalletChan prefix", () => {
  assert.equal(prefixWalletError(null), "WalletChan - Unknown error");
  assert.equal(prefixWalletError("Denied"), "WalletChan - Denied");
  assert.equal(
    prefixWalletError("WalletChan - Denied"),
    "WalletChan - Denied",
  );
  const error = makeProviderError("Denied", 4001);
  assert.equal(error.message, "WalletChan - Denied");
  assert.equal(error.code, 4001);
});
