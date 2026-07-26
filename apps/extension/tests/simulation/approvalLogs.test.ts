import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  keccak256,
  padHex,
  stringToHex,
} from "viem";

import { discoverApprovalIntentsFromLogs } from "../../src/chrome/simulation/approvalLogs";
import { PERMIT2_ADDRESS } from "../../src/chrome/simulation/constants";
import type { EthSimulateCallResult } from "../../src/chrome/simulation/ethSimulateLogs";

const OWNER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";
const OTHER = "0x4444444444444444444444444444444444444444";

const topic = (signature: string) =>
  keccak256(stringToHex(signature));
const addressTopic = (address: `0x${string}`) =>
  padHex(address, { size: 32 });

test("successful ERC-20 Approval logs discover runtime-nested grants", () => {
  const callResults: EthSimulateCallResult[] = [{
    status: "0x1",
    logs: [{
      address: TOKEN,
      topics: [
        topic("Approval(address,address,uint256)"),
        addressTopic(OWNER),
        addressTopic(SPENDER),
      ],
      data: encodeAbiParameters([{ type: "uint256" }], [321n]),
    }],
  }];

  const discovered = discoverApprovalIntentsFromLogs(callResults, OWNER);
  assert.equal(discovered.incomplete, false);
  assert.equal(discovered.intents.length, 1);
  assert.equal(discovered.intents[0]?.system, "erc20");
  assert.equal(discovered.intents[0]?.requestedAmount, 321n);
});

test("failed calls and approvals for another owner are ignored", () => {
  const approvalLog = {
    address: TOKEN,
    topics: [
      topic("Approval(address,address,uint256)"),
      addressTopic(OTHER),
      addressTopic(SPENDER),
    ],
    data: encodeAbiParameters([{ type: "uint256" }], [5n]),
  };
  const discovered = discoverApprovalIntentsFromLogs(
    [
      { status: "0x0", logs: [{ ...approvalLog, topics: [
        approvalLog.topics[0],
        addressTopic(OWNER),
        approvalLog.topics[2],
      ] }] },
      { status: "0x1", logs: [approvalLog] },
    ],
    OWNER,
  );
  assert.deepEqual(discovered.intents, []);
  assert.equal(discovered.incomplete, false);
});

test("Permit2 Approval and Lockdown events use the canonical emitter", () => {
  const discovered = discoverApprovalIntentsFromLogs(
    [{
      status: "0x1",
      logs: [
        {
          address: PERMIT2_ADDRESS,
          topics: [
            topic("Approval(address,address,address,uint160,uint48)"),
            addressTopic(OWNER),
            addressTopic(TOKEN),
            addressTopic(SPENDER),
          ],
          data: encodeAbiParameters(
            [{ type: "uint160" }, { type: "uint48" }],
            [55n, 2_000_000_000],
          ),
        },
        {
          address: PERMIT2_ADDRESS,
          topics: [
            topic("Permit(address,address,address,uint160,uint48,uint48)"),
            addressTopic(OWNER),
            addressTopic(TOKEN),
            addressTopic(SPENDER),
          ],
          data: encodeAbiParameters(
            [
              { type: "uint160" },
              { type: "uint48" },
              { type: "uint48" },
            ],
            [77n, 2_100_000_000, 3],
          ),
        },
        {
          address: PERMIT2_ADDRESS,
          topics: [
            topic("Lockdown(address,address,address)"),
            addressTopic(OWNER),
          ],
          data: encodeAbiParameters(
            [{ type: "address" }, { type: "address" }],
            [TOKEN, SPENDER],
          ),
        },
      ],
    }],
    OWNER,
  );

  assert.equal(discovered.incomplete, false);
  assert.deepEqual(
    discovered.intents.map((intent) => [
      intent.requestedAmount,
      intent.expiration,
      intent.grantLike,
    ]),
    [
      [55n, 2_000_000_000, true],
      [77n, 2_100_000_000, true],
      [0n, 0, false],
    ],
  );
});

test("malformed matching approval events mark detection incomplete", () => {
  const discovered = discoverApprovalIntentsFromLogs(
    [{
      status: "0x1",
      logs: [{
        address: TOKEN,
        topics: [
          topic("Approval(address,address,uint256)"),
          addressTopic(OWNER),
        ],
        data: "0x01",
      }],
    }],
    OWNER,
  );
  assert.deepEqual(discovered.intents, []);
  assert.equal(discovered.incomplete, true);
});

test("logs without a trustworthy call status mark detection incomplete", () => {
  const discovered = discoverApprovalIntentsFromLogs(
    [{
      logs: [{
        address: TOKEN,
        topics: [
          topic("Approval(address,address,uint256)"),
          addressTopic(OWNER),
          addressTopic(SPENDER),
        ],
        data: encodeAbiParameters([{ type: "uint256" }], [1n]),
      }],
    }],
    OWNER,
  );
  assert.deepEqual(discovered.intents, []);
  assert.equal(discovered.incomplete, true);
});
