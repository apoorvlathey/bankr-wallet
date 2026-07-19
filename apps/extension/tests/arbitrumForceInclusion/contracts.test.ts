import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics } from "viem";
import {
  ARBITRUM_INBOX_ABI,
  BRIDGE_MESSAGE_DELIVERED_ABI,
  decodeDeliveredMessage,
  encodeDelayedMessage,
} from "../../src/chrome/arbitrumForceInclusion/contracts";

const BRIDGE = "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a" as const;
const INBOX = "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f" as const;

test("signed child bytes are wrapped in the Inbox sendL2Message call", () => {
  const calldata = encodeDelayedMessage("0x04deadbeef");
  assert.match(calldata, /^0x[0-9a-f]+$/u);
  const decoded = decodeFunctionData({ abi: ARBITRUM_INBOX_ABI, data: calldata });
  assert.equal(decoded.functionName, "sendL2Message");
  assert.deepEqual(decoded.args, ["0x04deadbeef"]);
});

test("Bridge delivery extraction retains the exact force preimage", () => {
  const messageIndex = 7n;
  const beforeInboxAcc = `0x${"11".repeat(32)}` as const;
  const sender = "0x1234567890123456789012345678901234567890" as const;
  const messageDataHash = `0x${"22".repeat(32)}` as const;
  const topics = encodeEventTopics({
    abi: BRIDGE_MESSAGE_DELIVERED_ABI,
    eventName: "MessageDelivered",
    args: { messageIndex, beforeInboxAcc },
  });
  const data = encodeAbiParameters(
    [
      { type: "address" },
      { type: "uint8" },
      { type: "address" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint64" },
    ],
    [INBOX, 3, sender, messageDataHash, 42n, 1_700_000_000n],
  );
  const delivered = decodeDeliveredMessage(
    { logs: [{ address: BRIDGE, data, topics }] } as any,
    BRIDGE,
    INBOX,
  );
  assert.equal(delivered.messageIndex, messageIndex);
  assert.equal(delivered.kind, 3);
  assert.equal(delivered.sender, sender);
  assert.equal(delivered.messageDataHash, messageDataHash);
  assert.equal(delivered.baseFeeL1, 42n);
  assert.equal(delivered.timestamp, 1_700_000_000n);
});
