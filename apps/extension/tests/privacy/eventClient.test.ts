import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
} from "viem";

import {
  readPrivacyDepositEvents,
  readPrivacyPoolEvents,
} from "../../src/chrome/privacy/events/client";
import {
  isValidPrivacyDepositEvent,
  isValidPrivacyEventCheckpoint,
  isValidPrivacyRagequitEvent,
  isValidPrivacyWithdrawalEvent,
} from "../../src/chrome/privacy/events/types";

const ABI = parseAbi([
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)",
  "event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)",
]);
const POOL = "0x644d5A2554d36e27509254F32ccfeBe8cd58861f";
const DEPOSITOR = "0x1111111111111111111111111111111111111111";
const TX_HASH = `0x${"22".repeat(32)}`;
const BLOCK_HASH = `0x${"33".repeat(32)}`;

test("bounded Sepolia log client decodes the exact pool deposit event", async () => {
  const originalFetch = globalThis.fetch;
  const topics = encodeEventTopics({
    abi: ABI,
    eventName: "Deposited",
    args: { _depositor: DEPOSITOR },
  });
  const data = encodeAbiParameters(
    [
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
    ],
    [123n, 456n, 99_000n, 789n],
  );
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.method, "eth_getLogs");
    assert.equal(body.params[0].address, POOL);
    assert.equal(body.params[0].topics[0].length, 3);
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: [{
        address: POOL,
        blockNumber: "0x64",
        blockHash: BLOCK_HASH,
        transactionHash: TX_HASH,
        logIndex: "0x2",
        data,
        topics,
        removed: false,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const events = await readPrivacyDepositEvents("https://rpc.example", 90n, 110n);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      version: 1,
      id: `${TX_HASH}:2`,
      chainId: 11_155_111,
      blockNumber: "100",
      blockHash: BLOCK_HASH,
      logIndex: 2,
      transactionHash: TX_HASH,
      depositor: DEPOSITOR,
      commitment: "123",
      label: "456",
      valueWei: "99000",
      precommitment: "789",
    });
    assert.equal(isValidPrivacyDepositEvent(events[0]), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("event and checkpoint codecs reject route drift and inconsistent cursors", () => {
  const event = {
    version: 1,
    id: `${TX_HASH}:2`,
    chainId: 11_155_111,
    blockNumber: "100",
    blockHash: BLOCK_HASH,
    logIndex: 2,
    transactionHash: TX_HASH,
    depositor: DEPOSITOR,
    commitment: "123",
    label: "456",
    valueWei: "99000",
    precommitment: "789",
  };
  assert.equal(isValidPrivacyDepositEvent(event), true);
  assert.equal(isValidPrivacyDepositEvent({ ...event, chainId: 1 }), false);
  assert.equal(isValidPrivacyDepositEvent({ ...event, secret: "1" }), false);

  const checkpoint = {
    version: 1,
    key: "sepolia-pool-events",
    chainId: 11_155_111,
    nextBlock: "101",
    lastBlockNumber: "100",
    lastBlockHash: BLOCK_HASH,
    lastSyncAt: 1,
  };
  assert.equal(isValidPrivacyEventCheckpoint(checkpoint), true);
  assert.equal(isValidPrivacyEventCheckpoint({ ...checkpoint, nextBlock: "102" }), false);
});

test("pool event client decodes withdrawals and ragequits in the same page", async () => {
  const originalFetch = globalThis.fetch;
  const withdrawnTopics = encodeEventTopics({
    abi: ABI,
    eventName: "Withdrawn",
    args: { _processooor: DEPOSITOR },
  });
  const ragequitTopics = encodeEventTopics({
    abi: ABI,
    eventName: "Ragequit",
    args: { _ragequitter: DEPOSITOR },
  });
  globalThis.fetch = (async () => new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: [
      {
        address: POOL,
        blockNumber: "0x64",
        blockHash: BLOCK_HASH,
        transactionHash: TX_HASH,
        logIndex: "0x3",
        data: encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
          [50n, 123n, 456n],
        ),
        topics: withdrawnTopics,
        removed: false,
      },
      {
        address: POOL,
        blockNumber: "0x65",
        blockHash: BLOCK_HASH,
        transactionHash: `0x${"44".repeat(32)}`,
        logIndex: "0x0",
        data: encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
          [456n, 789n, 50n],
        ),
        topics: ragequitTopics,
        removed: false,
      },
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const events = await readPrivacyPoolEvents("https://rpc.example", 90n, 110n);
    assert.equal(events.deposits.length, 0);
    assert.equal(events.withdrawals.length, 1);
    assert.equal(events.ragequits.length, 1);
    assert.equal(events.withdrawals[0].spentNullifier, "123");
    assert.equal(events.withdrawals[0].newCommitment, "456");
    assert.equal(events.ragequits[0].label, "789");
    assert.equal(isValidPrivacyWithdrawalEvent(events.withdrawals[0]), true);
    assert.equal(isValidPrivacyRagequitEvent(events.ragequits[0]), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
