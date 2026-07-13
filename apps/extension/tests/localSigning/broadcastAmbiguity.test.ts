import assert from "node:assert/strict";
import test from "node:test";
import { keccak256 } from "viem";

import {
  broadcastSerializedTransaction,
  isBroadcastOutcomeUncertain,
  prepareSignAndBroadcastTransaction,
} from "../../src/chrome/localSigner";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../src/chrome/storageLock";

const SERIALIZED = `0x02${"11".repeat(96)}` as `0x${string}`;
const LOCAL_HASH = keccak256(SERIALIZED);

test("sync timeout retries only byte-identical signed transaction data", async () => {
  const calls: Array<{ method: string; serialized: string }> = [];
  const client = {
    async request(args: any) {
      calls.push({ method: args.method, serialized: args.params[0] });
      if (args.method === "eth_sendRawTransactionSync") {
        throw new Error("response timed out after node acceptance");
      }
      return LOCAL_HASH;
    },
  } as any;

  const result = await broadcastSerializedTransaction(client, SERIALIZED, {
    chainId: 4326,
    supportsSyncSend: true,
  });
  assert.deepEqual(calls, [
    { method: "eth_sendRawTransactionSync", serialized: SERIALIZED },
    { method: "eth_sendRawTransaction", serialized: SERIALIZED },
  ]);
  assert.equal(result.txHash, LOCAL_HASH);
  assert.equal(result.broadcastUncertain, undefined);
});

test("ambiguous async error retains deterministic local hash", async () => {
  const client = {
    async request() {
      throw new Error("socket closed after write");
    },
  } as any;

  const result = await broadcastSerializedTransaction(client, SERIALIZED, {
    chainId: 1,
    supportsSyncSend: false,
  });
  assert.deepEqual(result, {
    txHash: LOCAL_HASH,
    broadcastUncertain: true,
  });
  assert.equal(isBroadcastOutcomeUncertain(result), true);
});

test("sync and async ambiguity never creates a second transaction", async () => {
  const serialized: string[] = [];
  const client = {
    async request(args: any) {
      serialized.push(args.params[0]);
      throw new Error("relay unavailable");
    },
  } as any;

  const result = await broadcastSerializedTransaction(client, SERIALIZED, {
    chainId: 4326,
    supportsSyncSend: true,
  });
  assert.deepEqual(serialized, [SERIALIZED, SERIALIZED]);
  assert.equal(new Set(serialized).size, 1);
  assert.equal(result.txHash, LOCAL_HASH);
  assert.equal(result.broadcastUncertain, true);
});

test("preparation failure remains definite and never reaches RPC", async () => {
  let signed = false;
  let requested = false;
  const client = {
    async prepareTransactionRequest() {
      throw new Error("insufficient funds during preparation");
    },
    async signTransaction() {
      signed = true;
      return SERIALIZED;
    },
    async request() {
      requested = true;
      return LOCAL_HASH;
    },
  } as any;

  await assert.rejects(
    prepareSignAndBroadcastTransaction(client, {} as any, {
      chainId: 1,
      supportsSyncSend: false,
    }),
    /insufficient funds/i,
  );
  assert.equal(signed, false);
  assert.equal(requested, false);
});

test("authorization revoked after deferred preparation stops before raw broadcast", async () => {
  let releasePreparation!: () => void;
  const preparationGate = new Promise<void>((resolve) => {
    releasePreparation = resolve;
  });
  let releaseAuthorization!: () => void;
  const authorizationGate = new Promise<void>((resolve) => {
    releaseAuthorization = resolve;
  });
  let markAuthorizationStarted!: () => void;
  const authorizationStarted = new Promise<void>((resolve) => {
    markAuthorizationStarted = resolve;
  });
  let authorized = true;
  let signed = false;
  let requested = false;
  let authorizationChecks = 0;
  const client = {
    async prepareTransactionRequest() {
      await preparationGate;
      return { gas: 123n };
    },
    async signTransaction() {
      signed = true;
      return SERIALIZED;
    },
    async request() {
      requested = true;
      return LOCAL_HASH;
    },
  } as any;

  const result = prepareSignAndBroadcastTransaction(client, {} as any, {
    chainId: 1,
    supportsSyncSend: false,
    beforeBroadcast: async () => {
      authorizationChecks += 1;
      markAuthorizationStarted();
      await authorizationGate;
      if (!authorized) throw new Error("authorization revoked");
    },
  });

  // Finish slow RPC preparation, then revoke while the final async lifecycle
  // check itself is pending. The continuation must still stop before request.
  releasePreparation();
  await authorizationStarted;
  authorized = false;
  releaseAuthorization();

  await assert.rejects(result, /authorization revoked/i);
  assert.equal(signed, true, "authorization runs after preparation and signing");
  assert.equal(authorizationChecks, 1);
  assert.equal(requested, false, "no signed bytes crossed the RPC boundary");
});

test("account mutation cannot interleave between final validation and raw send", async () => {
  let releasePreparation!: () => void;
  const preparationGate = new Promise<void>((resolve) => {
    releasePreparation = resolve;
  });
  let markPreparationStarted!: () => void;
  const preparationStarted = new Promise<void>((resolve) => {
    markPreparationStarted = resolve;
  });
  const events: string[] = [];
  const client = {
    async prepareTransactionRequest() {
      events.push("prepare-start");
      markPreparationStarted();
      await preparationGate;
      events.push("prepare-end");
      return { gas: 123n };
    },
    async signTransaction() {
      events.push("sign");
      return SERIALIZED;
    },
    async request() {
      events.push("raw-send");
      return LOCAL_HASH;
    },
  } as any;

  const broadcast = prepareSignAndBroadcastTransaction(client, {} as any, {
    chainId: 1,
    supportsSyncSend: false,
    beforeBroadcast: async () => {
      events.push("account-and-transport-valid");
    },
  });
  await preparationStarted;

  // Account removal/conversion and auth-session termination use this same
  // operation lock. Even though queued while preparation is slow, mutation
  // cannot run in the validation -> raw-send window.
  const mutation = withStorageLock(
    WALLET_SECRET_OPERATION_LOCK_KEY,
    async () => {
      events.push("account-mutation");
    },
  );
  releasePreparation();
  await Promise.all([broadcast, mutation]);

  assert.deepEqual(events, [
    "prepare-start",
    "prepare-end",
    "sign",
    "account-and-transport-valid",
    "raw-send",
    "account-mutation",
  ]);
});

test("single force inclusion uses the sign-once uncertainty contract", async () => {
  let prepareCount = 0;
  let signCount = 0;
  const client = {
    async prepareTransactionRequest() {
      prepareCount += 1;
      return { gas: 123n };
    },
    async signTransaction() {
      signCount += 1;
      return SERIALIZED;
    },
    async request() {
      throw new Error("L1 RPC response lost");
    },
  } as any;

  const result = await prepareSignAndBroadcastTransaction(
    client,
    {} as any,
    { chainId: 1, supportsSyncSend: false },
  );
  assert.equal(prepareCount, 1);
  assert.equal(signCount, 1);
  assert.equal(result.txHash, LOCAL_HASH);
  assert.equal(result.broadcastUncertain, true);
  assert.equal(result.signedGasLimit, 123n);
});
