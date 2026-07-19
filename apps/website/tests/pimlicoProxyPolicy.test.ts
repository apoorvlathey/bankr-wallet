import assert from "node:assert/strict";
import test from "node:test";
import {
  ENTRY_POINT_V07,
  getUserOperationTypedData,
  parsePimlicoProxyEnvelope,
  verifyPimlicoSendEnvelope,
  WALLETCHAN_OFFICIAL_DELEGATE,
} from "../app/api/gas/pimlico/[chainId]/policy";
import { privateKeyToAccount } from "viem/accounts";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDT = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

test("allows only exact catalog tokens on their configured chain", () => {
  assert.equal(
    parsePimlicoProxyEnvelope(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "pimlico_getTokenQuotes",
        params: [{ tokens: [USDC] }, ENTRY_POINT_V07, "0x2105"],
      },
      8453,
    ).ok,
    true,
  );
  assert.equal(
    parsePimlicoProxyEnvelope(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "pimlico_getTokenQuotes",
        params: [{ tokens: [USDT] }, ENTRY_POINT_V07, "0x2105"],
      },
      8453,
    ).ok,
    true,
  );
  assert.equal(
    parsePimlicoProxyEnvelope(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "pimlico_getTokenQuotes",
        params: [{ tokens: [USDT] }, ENTRY_POINT_V07, "0xa4b1"],
      },
      42161,
    ).ok,
    false,
  );
  assert.equal(
    parsePimlicoProxyEnvelope(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "pimlico_getTokenQuotes",
        params: [
          { tokens: ["0x1111111111111111111111111111111111111111"] },
          ENTRY_POINT_V07,
          "0x2105",
        ],
      },
      8453,
    ).ok,
    false,
  );
});

test("rejects arbitrary methods and unsupported chains", () => {
  assert.equal(
    parsePimlicoProxyEnvelope(
      { jsonrpc: "2.0", id: 1, method: "eth_call", params: [] },
      8453,
    ).ok,
    false,
  );
  assert.equal(
    parsePimlicoProxyEnvelope(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "pimlico_getUserOperationGasPrice",
        params: [],
      },
      130,
    ).ok,
    false,
  );
});

function sendEnvelope(sender: `0x${string}`, signature: `0x${string}`) {
  const userOperation: Record<string, unknown> & {
    callData: string;
    eip7702Auth?: Record<string, unknown>;
  } = {
    sender,
    nonce: "0x7",
    callData: "0x1234",
    callGasLimit: "0x100",
    verificationGasLimit: "0x200",
    preVerificationGas: "0x300",
    maxFeePerGas: "0x400",
    maxPriorityFeePerGas: "0x500",
    paymaster: "0x4444444444444444444444444444444444444444",
    paymasterVerificationGasLimit: "0x600",
    paymasterPostOpGasLimit: "0x700",
    paymasterData: "0xabcd",
    signature,
  };
  return {
    jsonrpc: "2.0" as const,
    id: 3,
    method: "eth_sendUserOperation",
    params: [userOperation, ENTRY_POINT_V07] as [
      typeof userOperation,
      typeof ENTRY_POINT_V07,
    ],
  };
}

test("accepts only a sender-signed MetaMask-compatible UserOperation", async () => {
  const account = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );
  const unsigned = sendEnvelope(account.address, "0x");
  const signature = await account.signTypedData(
    getUserOperationTypedData(unsigned.params[0] as never, 8453),
  );
  const signed = sendEnvelope(account.address, signature);
  const parsed = parsePimlicoProxyEnvelope(signed, 8453);
  assert.equal(parsed.ok, true);
  assert.equal(
    parsed.ok && (await verifyPimlicoSendEnvelope(parsed.envelope, 8453)),
    true,
  );
  signed.params[0].callData = "0xabcd";
  assert.equal(await verifyPimlicoSendEnvelope(signed, 8453), false);
});

test("verifies a first-use EIP-7702 authorization against the UserOperation sender", async () => {
  const account = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );
  const authorization = await account.signAuthorization({
    address: WALLETCHAN_OFFICIAL_DELEGATE,
    chainId: 8453,
    nonce: 0,
  });
  const envelope = sendEnvelope(account.address, "0x");
  envelope.params[0].eip7702Auth = {
    address: authorization.address,
    chainId: `0x${authorization.chainId.toString(16)}`,
    nonce: `0x${authorization.nonce.toString(16)}`,
    r: authorization.r,
    s: authorization.s,
    yParity: `0x${(authorization.yParity ?? 0).toString(16)}`,
  };
  envelope.params[0].signature = await account.signTypedData(
    getUserOperationTypedData(envelope.params[0] as never, 8453),
  );
  assert.equal(await verifyPimlicoSendEnvelope(envelope, 8453), true);

  envelope.params[0].eip7702Auth.nonce = "0x1";
  assert.equal(await verifyPimlicoSendEnvelope(envelope, 8453), false);
});

test("rejects malformed, non-official, or cross-chain 7702 authorizations", async () => {
  const account = privateKeyToAccount(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  );
  const envelope = sendEnvelope(
    account.address,
    `0x${"11".repeat(65)}`,
  );
  Object.assign(envelope.params[0], {
    eip7702Auth: {
      address: WALLETCHAN_OFFICIAL_DELEGATE,
      chainId: "0x2105",
      nonce: "0x0",
      r: `0x${"01".repeat(32)}`,
      s: `0x${"02".repeat(32)}`,
      yParity: "0x0",
    },
  });
  const parsed = parsePimlicoProxyEnvelope(envelope, 8453);
  assert.equal(parsed.ok, true);
  assert.equal(
    parsed.ok && (await verifyPimlicoSendEnvelope(parsed.envelope, 8453)),
    false,
  );
  envelope.params[0].eip7702Auth!.chainId = "0x1";
  assert.equal(parsePimlicoProxyEnvelope(envelope, 8453).ok, false);
  envelope.params[0].eip7702Auth!.chainId = "0x2105";
  envelope.params[0].eip7702Auth!.address =
    "0x1111111111111111111111111111111111111111";
  assert.equal(parsePimlicoProxyEnvelope(envelope, 8453).ok, false);
});

test("allows only an exact official sender-code override for fresh-account estimation", () => {
  const sender = "0x2222222222222222222222222222222222222222";
  const operation = sendEnvelope(sender, `0x${"11".repeat(65)}`).params[0];
  operation.eip7702Auth = {
    address: WALLETCHAN_OFFICIAL_DELEGATE,
    chainId: "0x2105",
    nonce: "0x0",
    r: `0x${"01".repeat(32)}`,
    s: `0x${"02".repeat(32)}`,
    yParity: "0x0",
  };
  const officialCode = `0xef0100${WALLETCHAN_OFFICIAL_DELEGATE.slice(2)}`;
  const envelope = {
    jsonrpc: "2.0" as const,
    id: 4,
    method: "eth_estimateUserOperationGas",
    params: [
      operation,
      ENTRY_POINT_V07,
      { [sender]: { code: officialCode } },
    ] as unknown[],
  };
  assert.equal(parsePimlicoProxyEnvelope(envelope, 8453).ok, true);

  envelope.params[2] = { [sender]: { code: "0x6000" } };
  assert.equal(parsePimlicoProxyEnvelope(envelope, 8453).ok, false);
  envelope.params[2] = { [sender]: { code: officialCode, stateDiff: {} } };
  assert.equal(parsePimlicoProxyEnvelope(envelope, 8453).ok, false);
  envelope.params[2] = {
    "0x3333333333333333333333333333333333333333": { code: officialCode },
  };
  assert.equal(parsePimlicoProxyEnvelope(envelope, 8453).ok, false);
});

test("never allows a state override on UserOperation submission", () => {
  const envelope = sendEnvelope(
    "0x2222222222222222222222222222222222222222",
    `0x${"11".repeat(65)}`,
  );
  (envelope.params as unknown[]).push({});
  assert.equal(parsePimlicoProxyEnvelope(envelope, 8453).ok, false);
});
