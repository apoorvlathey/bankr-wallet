import assert from "node:assert/strict";
import test from "node:test";

import { buildErc7715PermissionCaveats } from "../../src/chrome/erc7715/caveats";
import {
  getErc7715PermissionJustification,
  validateErc7715PermissionRequestPayload,
} from "../../src/chrome/erc7715/registry";
import {
  getPermissionExpirySeconds,
  parseHexChainId,
} from "../../src/chrome/erc7715/preflight";

const TOKEN = "0x0000000000000000000000000000000000000001";
const nowSeconds = Math.floor(Date.now() / 1000);
const startTime = nowSeconds + 60;
const expiry = nowSeconds + 3_600;

function request(
  type: string,
  data: Record<string, unknown>,
  rules: unknown = [{ type: "expiry", data: { timestamp: expiry } }],
) {
  return {
    chainId: "0x1",
    from: "0x0000000000000000000000000000000000000002",
    to: "0x0000000000000000000000000000000000000003",
    permission: {
      type,
      isAdjustmentAllowed: false,
      data,
    },
    ...(rules === undefined ? {} : { rules }),
  };
}

test("permission validation accepts each bounded permission vocabulary member", () => {
  const cases = [
    request("native-token-allowance", {
      allowanceAmount: "0x1",
      startTime,
    }),
    request("native-token-periodic", {
      periodAmount: "0x2",
      periodDuration: 3_600,
      startTime,
    }),
    request("native-token-stream", {
      initialAmount: "0x0",
      maxAmount: "0x100",
      amountPerSecond: "0x1",
      startTime,
    }),
    request("erc20-token-allowance", {
      tokenAddress: TOKEN,
      allowanceAmount: "0x3",
      startTime,
    }),
    request("erc20-token-periodic", {
      tokenAddress: TOKEN,
      periodAmount: "0x4",
      periodDuration: 86_400,
      startTime,
    }),
    request("erc20-token-stream", {
      tokenAddress: TOKEN,
      initialAmount: "0x0",
      maxAmount: "0x100",
      amountPerSecond: "0x1",
      startTime,
    }),
    request("token-approval-revocation", {
      erc20Approve: true,
      erc721Approve: false,
      erc721SetApprovalForAll: false,
      permit2Approve: false,
      permit2Lockdown: false,
      permit2InvalidateNonces: false,
    }),
  ];

  for (const candidate of cases) {
    assert.equal(
      validateErc7715PermissionRequestPayload(candidate, 0),
      candidate.permission.type,
    );
  }
});

test("caveat construction fixes enforcer order and never accepts dapp enforcers", () => {
  const native = buildErc7715PermissionCaveats(
    request("native-token-allowance", {
      allowanceAmount: "0x1",
      startTime,
    }),
    0,
    { delegationNonce: 7n },
  );
  assert.deepEqual(
    native.map((entry) => entry.enforcerName),
    [
      "NativeTokenPeriodTransferEnforcer",
      "ExactCalldataEnforcer",
      "NonceEnforcer",
      "TimestampEnforcer",
    ],
  );
  assert.equal(native[1].terms, "0x");
  assert.equal(native[2].terms, `0x${"0".repeat(63)}7`);

  const erc20 = buildErc7715PermissionCaveats(
    request("erc20-token-allowance", {
      tokenAddress: TOKEN,
      allowanceAmount: "0x2",
      startTime,
    }),
    0,
    { delegationNonce: 8n },
  );
  assert.deepEqual(
    erc20.map((entry) => entry.enforcerName),
    [
      "ERC20PeriodTransferEnforcer",
      "ValueLteEnforcer",
      "NonceEnforcer",
      "TimestampEnforcer",
    ],
  );
  assert.equal(erc20[1].terms, `0x${"0".repeat(64)}`);

  assert.throws(
    () =>
      buildErc7715PermissionCaveats(
        {
          ...request("native-token-allowance", {
            allowanceAmount: "0x1",
            startTime,
          }),
          enforcer: TOKEN,
        },
        0,
        { delegationNonce: 0n },
      ),
    /unsupported field 'enforcer'/,
  );
});

test("validation rejects unbounded, ambiguous, expired, and ineffective authority", () => {
  assert.throws(
    () =>
      validateErc7715PermissionRequestPayload(
        request("native-token-allowance", {
          allowanceAmount: `0x${"f".repeat(64)}`,
          startTime,
        }),
        0,
      ),
    /finite and bounded/,
  );
  assert.throws(
    () =>
      validateErc7715PermissionRequestPayload(
        {
          ...request("native-token-stream", {
            amountPerSecond: "0x1",
            startTime,
          }),
          rules: undefined,
        },
        0,
      ),
    /requires an expiry/,
  );
  assert.throws(
    () =>
      validateErc7715PermissionRequestPayload(
        request("native-token-allowance", {
          allowanceAmount: "0x1",
          startTime,
          unexpected: true,
        }),
        0,
      ),
    /unsupported field 'unexpected'/,
  );
  assert.throws(
    () =>
      validateErc7715PermissionRequestPayload(
        request("token-approval-revocation", {
          erc20Approve: false,
          erc721Approve: false,
          erc721SetApprovalForAll: false,
          permit2Approve: false,
          permit2Lockdown: false,
          permit2InvalidateNonces: false,
        }),
        0,
      ),
    /enable at least one revocation method/,
  );

  assert.throws(
    () =>
      getErc7715PermissionJustification({
        justification: "direct",
        data: { justification: "nested" },
      }),
    /ambiguous/,
  );
});

test("preflight value helpers remain strict and expiry-only", () => {
  assert.equal(parseHexChainId("0x1"), 1);
  assert.equal(parseHexChainId("0x00a"), 10);
  assert.equal(parseHexChainId("1"), null);
  assert.equal(parseHexChainId("0x0"), null);
  assert.equal(parseHexChainId("0xgg"), null);

  const candidate = request("native-token-allowance", {
    allowanceAmount: "0x1",
    startTime,
  });
  assert.equal(getPermissionExpirySeconds(candidate as never), expiry);
  assert.equal(
    getPermissionExpirySeconds({ ...candidate, rules: undefined } as never),
    null,
  );
});
