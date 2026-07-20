import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEthSimulateV1CallResults,
  safeHexToBigInt,
  type EthSimulateLog,
} from "../../src/chrome/simulation/ethSimulateLogs";
import { MAX_SIMULATION_ASSET_CHANGES } from "../../src/chrome/simulation/constants";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const WALLET = "0x1111111111111111111111111111111111111111";
const PEER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const NFT = "0x4444444444444444444444444444444444444444";
const ERC1155 = "0x5555555555555555555555555555555555555555";

function addressTopic(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2)}`;
}

function transfer(
  address: string,
  from: string,
  to: string,
  amount: bigint,
): EthSimulateLog {
  return {
    address,
    topics: [TRANSFER_TOPIC, addressTopic(from), addressTopic(to)],
    data: `0x${amount.toString(16)}`,
  };
}

test("eth_simulateV1 logs produce ordered net ERC-20 and native deltas", () => {
  const parsed = parseEthSimulateV1CallResults(
    [
      {
        status: "0x1",
        logs: [
          transfer(TOKEN, WALLET, PEER, 5n),
          transfer(TOKEN, PEER, WALLET, 2n),
          transfer(NATIVE_SENTINEL, WALLET, PEER, 1n),
          transfer(NATIVE_SENTINEL, PEER, WALLET, 7n),
        ],
      },
      { status: "0x0", logs: [transfer(TOKEN, WALLET, WALLET, 9n)] },
    ],
    WALLET.toUpperCase(),
  );

  assert.equal(parsed.allSuccess, false);
  assert.equal(parsed.nativeDelta, 6n);
  assert.deepEqual(parsed.tokens, [TOKEN]);
  assert.deepEqual(parsed.deltas, [-3n]);
});

test("NFT-shaped emitters are excluded from fungible-token aggregation", () => {
  const parsed = parseEthSimulateV1CallResults(
    [
      {
        status: "0x1",
        logs: [
          transfer(NFT, PEER, WALLET, 1n),
          {
            address: NFT,
            topics: [
              TRANSFER_TOPIC,
              addressTopic(PEER),
              addressTopic(WALLET),
              "0x01",
            ],
            data: "0x",
          },
          {
            address: ERC1155,
            topics: [
              TRANSFER_SINGLE_TOPIC,
              addressTopic(PEER),
              addressTopic(PEER),
              addressTopic(WALLET),
            ],
            data: "0x01",
          },
        ],
      },
    ],
    WALLET,
  );

  assert.deepEqual(parsed, {
    allSuccess: true,
    nativeDelta: 0n,
    tokens: [],
    deltas: [],
  });
});

test("untrusted malformed amounts fail closed to a zero delta", () => {
  assert.equal(safeHexToBigInt(undefined), 0n);
  assert.equal(safeHexToBigInt("0x"), 0n);
  assert.equal(safeHexToBigInt("not-hex"), 0n);
  assert.equal(safeHexToBigInt("0x2a"), 42n);

  const parsed = parseEthSimulateV1CallResults(
    [
      {
        status: "0x1",
        logs: [
          {
            address: TOKEN,
            topics: [
              TRANSFER_TOPIC,
              addressTopic(PEER),
              addressTopic(WALLET),
            ],
            data: "malformed",
          },
        ],
      },
    ],
    WALLET,
  );
  assert.deepEqual(parsed.tokens, []);
  assert.deepEqual(parsed.deltas, []);
});

test("eth_simulateV1 retains only the bounded token-change working set", () => {
  const logs = Array.from(
    { length: MAX_SIMULATION_ASSET_CHANGES + 20 },
    (_, index) =>
      transfer(
        `0x${(index + 1).toString(16).padStart(40, "0")}`,
        PEER,
        WALLET,
        1n,
      ),
  );
  const parsed = parseEthSimulateV1CallResults(
    [{ status: "0x1", logs }],
    WALLET,
  );
  assert.equal(parsed.tokens.length, MAX_SIMULATION_ASSET_CHANGES);
  assert.equal(parsed.deltas.length, MAX_SIMULATION_ASSET_CHANGES);
});
