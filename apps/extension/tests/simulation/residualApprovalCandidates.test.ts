import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  keccak256,
  padHex,
  stringToHex,
} from "viem";

import { allowancePairKey } from "../../src/chrome/simulation/approvalAllowanceState";
import { discoverResidualApprovalCandidates } from "../../src/chrome/simulation/residualApprovalCandidates";
import { projectResidualApprovals } from "../../src/chrome/simulation/residualApprovalProjection";
import type { EthSimulateCallResult } from "../../src/chrome/simulation/ethSimulateLogs";

const OWNER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const ROUTER = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x4444444444444444444444444444444444444444";
const EXACT_SPENDER = "0x5555555555555555555555555555555555555555";

const topic = (signature: string) => keccak256(stringToHex(signature));
const addressTopic = (address: `0x${string}`) =>
  padHex(address, { size: 32 });

function outgoingLogs(withApproval: boolean): EthSimulateCallResult[] {
  return [{
    status: "0x1",
    logs: [
      {
        address: TOKEN,
        topics: [
          topic("Transfer(address,address,uint256)"),
          addressTopic(OWNER),
          addressTopic(RECIPIENT),
        ],
        data: encodeAbiParameters([{ type: "uint256" }], [10n]),
      },
      ...(withApproval
        ? [{
            address: TOKEN,
            topics: [
              topic("Approval(address,address,uint256)"),
              addressTopic(OWNER),
              addressTopic(EXACT_SPENDER),
            ],
            data: encodeAbiParameters([{ type: "uint256" }], [90n]),
          }]
        : []),
    ],
  }];
}

test("outgoing ERC-20 logs retain exact Approval evidence plus the call-target fallback", () => {
  const result = discoverResidualApprovalCandidates(
    [{ to: ROUTER, data: "0x", value: "0x0" }],
    outgoingLogs(true),
    OWNER,
  );
  assert.equal(result.incomplete, false);
  assert.deepEqual(
    result.candidates.map((candidate) => [
      candidate.spender.toLowerCase(),
      candidate.evidence,
      candidate.sourceCallIndex,
    ]),
    [
      [EXACT_SPENDER, "approvalEvent", 0],
      [ROUTER, "callTarget", 0],
    ],
  );
});

test("incoming transfers and failed calls never create residual candidates", () => {
  const incoming = outgoingLogs(false);
  incoming[0].logs![0].topics = [
    topic("Transfer(address,address,uint256)"),
    addressTopic(RECIPIENT),
    addressTopic(OWNER),
  ];
  assert.deepEqual(
    discoverResidualApprovalCandidates(
      [{ to: ROUTER, data: "0x", value: "0x0" }],
      incoming,
      OWNER,
    ).candidates,
    [],
  );
  assert.deepEqual(
    discoverResidualApprovalCandidates(
      [{ to: ROUTER, data: "0x", value: "0x0" }],
      [{ ...outgoingLogs(false)[0], status: "0x0" }],
      OWNER,
    ).candidates,
    [],
  );
});

test("zero-value transfer logs do not imply token spend", () => {
  const logs = outgoingLogs(false);
  logs[0].logs![0].data = encodeAbiParameters([{ type: "uint256" }], [0n]);
  assert.deepEqual(
    discoverResidualApprovalCandidates(
      [{ to: ROUTER, data: "0x", value: "0x0" }],
      logs,
      OWNER,
    ).candidates,
    [],
  );
});

test("a non-zero final allowance is shown even when unlimited allowance did not decrement", () => {
  const [candidate] = discoverResidualApprovalCandidates(
    [{ to: ROUTER, data: "0x", value: "0x0" }],
    outgoingLogs(false),
    OWNER,
  ).candidates;
  const key = allowancePairKey({ ...candidate, system: "erc20" });
  const unlimited = 2n ** 256n - 1n;
  const projected = projectResidualApprovals(
    [candidate],
    new Map([[key, { amount: unlimited, expiration: null }]]),
    new Map([[key, { amount: unlimited, expiration: null }]]),
  );
  assert.equal(projected[0]?.remainingAmount, unlimited.toString());
  assert.equal(projected[0]?.spender.toLowerCase(), ROUTER);

  assert.deepEqual(
    projectResidualApprovals(
      [candidate],
      new Map([[key, { amount: 10n, expiration: null }]]),
      new Map([[key, { amount: 0n, expiration: null }]]),
    ),
    [],
  );
});
