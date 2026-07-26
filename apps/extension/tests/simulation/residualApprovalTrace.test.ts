import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData } from "viem";

import { parseResidualApprovalCallTrace } from "../../src/chrome/simulation/residualApprovalTrace";

const OWNER = "0x1111111111111111111111111111111111111111";
const ROUTER = "0x2222222222222222222222222222222222222222";
const PULLER = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x4444444444444444444444444444444444444444";
const RECIPIENT = "0x5555555555555555555555555555555555555555";

const TRANSFER_FROM_ABI = [{
  type: "function",
  name: "transferFrom",
  inputs: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ name: "success", type: "bool" }],
}] as const;

function transferFrom(owner = OWNER, amount = 10n) {
  return encodeFunctionData({
    abi: TRANSFER_FROM_ABI,
    functionName: "transferFrom",
    args: [owner, RECIPIENT, amount],
  });
}

test("nested transferFrom derives the token and immediate EVM caller", () => {
  const result = parseResidualApprovalCallTrace({
    type: "CALL",
    from: OWNER,
    to: OWNER,
    input: "0x",
    calls: [{
      type: "CALL",
      from: OWNER,
      to: ROUTER,
      input: "0x1234",
      calls: [{
        type: "CALL",
        from: ROUTER,
        to: PULLER,
        input: "0x5678",
        calls: [{
          type: "CALL",
          from: PULLER,
          to: TOKEN,
          input: transferFrom(),
        }],
      }],
    }],
  }, OWNER);

  assert.equal(result.incomplete, false);
  assert.deepEqual(result.candidates, [{
    tokenAddress: TOKEN,
    owner: OWNER,
    spender: PULLER,
    sourceCallIndex: 0,
    evidence: "transferFromTrace",
  }]);
});

test("wrong owners, zero amounts, delegatecalls, and reverted ancestors are ignored", () => {
  const calls = [
    {
      type: "CALL",
      from: PULLER,
      to: TOKEN,
      input: transferFrom(RECIPIENT),
    },
    {
      type: "CALL",
      from: PULLER,
      to: TOKEN,
      input: transferFrom(OWNER, 0n),
    },
    {
      type: "DELEGATECALL",
      from: PULLER,
      to: TOKEN,
      input: transferFrom(),
    },
    {
      type: "CALL",
      from: OWNER,
      to: ROUTER,
      input: "0x",
      error: "execution reverted",
      calls: [{
        type: "CALL",
        from: PULLER,
        to: TOKEN,
        input: transferFrom(),
      }],
    },
  ];
  assert.deepEqual(
    parseResidualApprovalCallTrace({ calls }, OWNER).candidates,
    [],
  );
});

test("malformed and oversized trace trees fail closed and report incomplete", () => {
  const root: { calls: unknown[] } = { calls: [] };
  let cursor = root;
  for (let index = 0; index < 40; index += 1) {
    const child: { type: string; calls: unknown[] } = {
      type: "CALL",
      calls: [],
    };
    cursor.calls.push(child);
    cursor = child;
  }
  const result = parseResidualApprovalCallTrace(root, OWNER);
  assert.equal(result.incomplete, true);
  assert.deepEqual(result.candidates, []);
});
