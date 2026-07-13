import assert from "node:assert/strict";
import test from "node:test";
import { toHex, type Address, type PublicClient } from "viem";

import {
  buildRetryOverrides,
  getPermit2AllowanceSlot,
  packPermit2AllowanceOverride,
} from "../../src/chrome/simulation/stateOverrides";

const OWNER: Address = "0x1111111111111111111111111111111111111111";
const ROUTER: Address = "0x2222222222222222222222222222222222222222";
const TOKEN: Address = "0x3333333333333333333333333333333333333333";
const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const BALANCE_SLOT = `0x${"11".repeat(32)}` as const;
const ALLOWANCE_SLOT = `0x${"22".repeat(32)}` as const;
const PROXY_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

test("Permit2 overrides preserve nonce and maximize expiry and amount", () => {
  const nonce = 0x123456789abcn;
  const current = toHex((nonce << 208n) | 17n, { size: 32 });
  const packed = BigInt(packPermit2AllowanceOverride(current));

  assert.equal((packed >> 208n) & 0xffffffffffffn, nonce);
  assert.equal((packed >> 160n) & 0xffffffffffffn, 0xffffffffffffn);
  assert.equal(
    packed & 0xffffffffffffffffffffffffffffffffffffffffn,
    0xffffffffffffffffffffffffffffffffffffffffn,
  );
  assert.equal(
    getPermit2AllowanceSlot(OWNER, TOKEN, ROUTER).length,
    66,
  );
});

test("retry overrides combine discovered token slots with Permit2 state", async () => {
  const nonce = 7n;
  const createAccessList = async ({
    to,
    data,
  }: {
    to: Address;
    data: `0x${string}`;
  }) => ({
    accessList: [
      {
        address: to,
        storageKeys: [
          PROXY_SLOT,
          data.startsWith("0x70a08231") ? BALANCE_SLOT : ALLOWANCE_SLOT,
        ],
      },
    ],
    gasUsed: 0n,
  });
  const getStorageAt = async () =>
    toHex((nonce << 208n) | 1n, { size: 32 });
  const client = { createAccessList, getStorageAt } as unknown as PublicClient;

  const overrides = await buildRetryOverrides(
    client,
    OWNER,
    ROUTER,
    [TOKEN],
  );

  assert.equal(overrides.length, 2);
  assert.deepEqual(overrides[0], {
    address: TOKEN,
    stateDiff: [
      { slot: BALANCE_SLOT, value: toHex(10n ** 30n, { size: 32 }) },
      {
        slot: ALLOWANCE_SLOT,
        value:
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
    ],
  });
  assert.equal(overrides[1].address, PERMIT2);
  assert.equal(
    overrides[1].stateDiff[0].slot,
    getPermit2AllowanceSlot(OWNER, TOKEN, ROUTER),
  );
  assert.equal(
    (BigInt(overrides[1].stateDiff[0].value) >> 208n) & 0xffffffffffffn,
    nonce,
  );
});
