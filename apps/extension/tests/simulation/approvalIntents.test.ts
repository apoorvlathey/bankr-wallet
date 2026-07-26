import assert from "node:assert/strict";
import test from "node:test";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  size,
  toHex,
  type Address,
  type Hex,
} from "viem";

import {
  ERC20_MUTATION_ABI,
  MULTICALL3_APPROVAL_ABI,
  PERMIT2_ABI,
  SAFE_MULTISEND_ABI,
} from "../../src/chrome/simulation/approvalAbis";
import { discoverApprovalIntents } from "../../src/chrome/simulation/approvalIntents";
import {
  MULTICALL3_ADDRESS,
  PERMIT2_ADDRESS,
} from "../../src/chrome/simulation/constants";
import { encodeApproveCalldata } from "../../src/lib/erc20Approve";

const OWNER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";
const MULTISEND = "0x4444444444444444444444444444444444444444";

function packSafeCall(
  to: Address,
  data: Hex,
  operation = 0,
): Hex {
  return concatHex([
    toHex(operation, { size: 1 }),
    to,
    toHex(0, { size: 32 }),
    toHex(size(data), { size: 32 }),
    data,
  ]);
}

test("direct ERC-20 grants and revokes are classified without guessing amounts", () => {
  const grant = discoverApprovalIntents(
    [{ to: TOKEN, data: encodeApproveCalldata(SPENDER, 25n) }],
    OWNER,
  );
  assert.equal(grant.incomplete, false);
  assert.deepEqual(
    grant.intents.map((intent) => ({
      system: intent.system,
      token: intent.tokenAddress.toLowerCase(),
      spender: intent.spender.toLowerCase(),
      amount: intent.requestedAmount,
      grantLike: intent.grantLike,
    })),
    [{
      system: "erc20",
      token: TOKEN,
      spender: SPENDER,
      amount: 25n,
      grantLike: true,
    }],
  );

  const revoke = discoverApprovalIntents(
    [{ to: TOKEN, data: encodeApproveCalldata(SPENDER, 0n) }],
    OWNER,
  );
  assert.equal(revoke.intents[0]?.grantLike, false);
});

test("ERC-20 increaseAllowance is grant-like while decreaseAllowance cannot create a warning", () => {
  const increase = encodeFunctionData({
    abi: ERC20_MUTATION_ABI,
    functionName: "increaseAllowance",
    args: [SPENDER, 25n],
  });
  const decrease = encodeFunctionData({
    abi: ERC20_MUTATION_ABI,
    functionName: "decreaseAllowance",
    args: [SPENDER, 10n],
  });
  const discovered = discoverApprovalIntents(
    [
      { to: TOKEN, data: increase },
      { to: TOKEN, data: decrease },
    ],
    OWNER,
  );

  assert.equal(discovered.incomplete, false);
  assert.deepEqual(
    discovered.intents.map((entry) => ({
      amount: entry.requestedAmount,
      grantLike: entry.grantLike,
      spender: entry.spender.toLowerCase(),
    })),
    [
      { amount: 25n, grantLike: true, spender: SPENDER },
      { amount: 10n, grantLike: false, spender: SPENDER },
    ],
  );
});

test("Permit2 grants retain token, spender, amount, and expiration", () => {
  const expiration = 2_000_000_000;
  const data = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: "approve",
    args: [TOKEN, SPENDER, 500n, expiration],
  });
  const discovered = discoverApprovalIntents(
    [{ to: PERMIT2_ADDRESS, data }],
    OWNER,
  );

  assert.equal(discovered.incomplete, false);
  assert.equal(discovered.intents.length, 1);
  assert.equal(discovered.intents[0]?.system, "permit2");
  assert.equal(discovered.intents[0]?.tokenAddress.toLowerCase(), TOKEN);
  assert.equal(discovered.intents[0]?.spender.toLowerCase(), SPENDER);
  assert.equal(discovered.intents[0]?.requestedAmount, 500n);
  assert.equal(discovered.intents[0]?.expiration, expiration);
});

test("ERC-2612 and Permit2 permits bind the reviewed owner", () => {
  const zeroWord = `0x${"00".repeat(32)}` as Hex;
  const erc2612 = encodeFunctionData({
    abi: ERC20_MUTATION_ABI,
    functionName: "permit",
    args: [OWNER, SPENDER, 75n, 2_000_000_000n, 27, zeroWord, zeroWord],
  });
  const permit2 = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: "permit",
    args: [
      OWNER,
      {
        details: {
          token: TOKEN,
          amount: 125n,
          expiration: 2_000_000_000,
          nonce: 0,
        },
        spender: SPENDER,
        sigDeadline: 2_000_000_000n,
      },
      "0x1234",
    ],
  });
  const discovered = discoverApprovalIntents(
    [
      { to: TOKEN, data: erc2612 },
      { to: PERMIT2_ADDRESS, data: permit2 },
    ],
    OWNER,
  );

  assert.deepEqual(
    discovered.intents.map((entry) => [
      entry.system,
      entry.requestedAmount,
    ]),
    [
      ["erc20", 75n],
      ["permit2", 125n],
    ],
  );

  assert.deepEqual(
    discoverApprovalIntents([{ to: TOKEN, data: erc2612 }], SPENDER).intents,
    [],
  );
});

test("canonical Multicall3 and Safe MultiSend expose nested approvals", () => {
  const approve = encodeApproveCalldata(SPENDER, 99n) as Hex;
  const multicallData = encodeFunctionData({
    abi: MULTICALL3_APPROVAL_ABI,
    functionName: "aggregate3",
    args: [[{ target: TOKEN, allowFailure: false, callData: approve }]],
  });
  const multicall = discoverApprovalIntents(
    [{ to: MULTICALL3_ADDRESS, data: multicallData }],
    OWNER,
  );
  assert.equal(multicall.incomplete, false);
  assert.equal(multicall.intents[0]?.requestedAmount, 99n);

  const multiSendData = encodeFunctionData({
    abi: SAFE_MULTISEND_ABI,
    functionName: "multiSend",
    args: [packSafeCall(TOKEN as Address, approve)],
  });
  const multiSend = discoverApprovalIntents(
    [{ to: MULTISEND, data: multiSendData }],
    OWNER,
  );
  assert.equal(multiSend.incomplete, false);
  assert.equal(multiSend.intents[0]?.requestedAmount, 99n);
});

test("ERC-7821 execute batches expose nested approvals", () => {
  const approve = encodeApproveCalldata(SPENDER, 44n) as Hex;
  const executionData = encodeAbiParameters(
    [{
      type: "tuple[]",
      components: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    }],
    [[{ to: TOKEN, value: 0n, data: approve }]],
  );
  const data = encodeFunctionData({
    abi: [{
      type: "function",
      name: "execute",
      stateMutability: "payable",
      inputs: [
        { name: "mode", type: "bytes32" },
        { name: "executionData", type: "bytes" },
      ],
      outputs: [],
    }] as const,
    functionName: "execute",
    args: [`0x01${"00".repeat(31)}`, executionData],
  });
  const discovered = discoverApprovalIntents(
    [{ to: OWNER, data }],
    OWNER,
  );
  assert.equal(discovered.incomplete, false);
  assert.equal(discovered.intents[0]?.requestedAmount, 44n);
});

test("opaque calls and Safe delegatecalls fail open only as an incomplete warning", () => {
  const opaque = discoverApprovalIntents(
    [{ to: TOKEN, data: "0x12345678" }],
    OWNER,
  );
  assert.deepEqual(opaque.intents, []);
  assert.equal(opaque.incomplete, true);

  const multiSendData = encodeFunctionData({
    abi: SAFE_MULTISEND_ABI,
    functionName: "multiSend",
    args: [
      packSafeCall(
        TOKEN as Address,
        encodeApproveCalldata(SPENDER, 1n) as Hex,
        1,
      ),
    ],
  });
  const delegated = discoverApprovalIntents(
    [{ to: MULTISEND, data: multiSendData }],
    OWNER,
  );
  assert.deepEqual(delegated.intents, []);
  assert.equal(delegated.incomplete, true);
});
