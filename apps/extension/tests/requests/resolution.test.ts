import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
  canSignalPendingTransactionCancellation,
  pendingRequestResolutionAction,
  resetPendingRequestResolutionClaimsForTests,
  runPendingRequestResolution,
  runPendingRequestResolutions,
  runWalletResetAgainstPendingResolutions,
  type PendingRequestFamily,
} from "../../src/chrome/requests/pendingRequestResolution";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const conflictResult = (winningAction: string) => ({
  success: false as const,
  error: `already ${winningAction}`,
});

afterEach(() => resetPendingRequestResolutionClaimsForTests());

const cases: Array<{
  name: string;
  family: PendingRequestFamily;
  requestId: string;
}> = [
  // Every single-transaction route shares this exact family+id namespace.
  { name: "legacy Bankr transaction", family: "transaction", requestId: "tx-legacy" },
  { name: "async Bankr transaction", family: "transaction", requestId: "tx-bankr" },
  { name: "private-key transaction", family: "transaction", requestId: "tx-pk" },
  { name: "seed-phrase transaction", family: "transaction", requestId: "tx-seed" },
  // Signature routing happens after the shared claim is acquired.
  { name: "Bankr signature", family: "signature", requestId: "sig-bankr" },
  { name: "private-key signature", family: "signature", requestId: "sig-pk" },
  { name: "seed-phrase signature", family: "signature", requestId: "sig-seed" },
  // Both ERC-5792 confirm implementations use the same bundle claim.
  { name: "Bankr wallet_sendCalls", family: "batchTransaction", requestId: "batch-bankr" },
  { name: "private-key wallet_sendCalls", family: "batchTransaction", requestId: "batch-pk" },
  { name: "seed-phrase wallet_sendCalls", family: "batchTransaction", requestId: "batch-seed" },
  // Connection prompts are globally serialized because confirming one origin
  // resolves sibling request IDs for that origin.
  { name: "dapp connection", family: "dappConnection", requestId: "all" },
  { name: "add-chain prompt", family: "addChain", requestId: "add-chain" },
  { name: "watch-asset prompt", family: "watchAsset", requestId: "watch-asset" },
  { name: "cross-dapp batch", family: "crossDappBatch", requestId: "active" },
  { name: "internal swap or sponsored transfer", family: "internalOperation", requestId: "internal-effect" },
];

for (const scenario of cases) {
  test(`${scenario.name}: concurrent reject cannot overtake confirm`, async () => {
    const gate = deferred();
    let confirms = 0;
    let rejects = 0;

    const confirm = runPendingRequestResolution({
      family: scenario.family,
      requestId: scenario.requestId,
      action: "confirm",
      conflictResult,
      resolve: async () => {
        confirms += 1;
        await gate.promise;
        return { success: true as const };
      },
    });
    const reject = runPendingRequestResolution({
      family: scenario.family,
      requestId: scenario.requestId,
      action: "reject",
      conflictResult,
      resolve: async () => {
        rejects += 1;
        return { success: true as const };
      },
    });

    // The claim exists synchronously, before the first resolver reaches an
    // await (indeed, before its deferred microtask even starts).
    assert.equal(
      pendingRequestResolutionAction(scenario.family, scenario.requestId),
      "confirm",
    );
    assert.deepEqual(await reject, {
      success: false,
      error: "already confirm",
    });
    assert.equal(rejects, 0);

    gate.resolve();
    assert.deepEqual(await confirm, { success: true });
    assert.equal(confirms, 1);
  });
}

test("a terminal durable removal prevents a late rejection from overwriting its result", async () => {
  const gate = deferred();
  const pending = new Set(["persisted-tx"]);
  let terminalResult = "";

  const confirm = runPendingRequestResolution({
    family: "transaction",
    requestId: "persisted-tx",
    action: "confirm",
    conflictResult,
    resolve: async () => {
      assert.equal(pending.has("persisted-tx"), true);
      await gate.promise;
      // Mirrors production ordering: durable pending removal precedes the
      // terminal result write and claim release.
      pending.delete("persisted-tx");
      terminalResult = "confirmed";
      return { success: true as const };
    },
  });
  gate.resolve();
  await confirm;

  await runPendingRequestResolution({
    family: "transaction",
    requestId: "persisted-tx",
    action: "reject",
    conflictResult,
    resolve: async () => {
      if (!pending.has("persisted-tx")) {
        return { success: false as const, error: "not found" };
      }
      terminalResult = "rejected";
      return { success: true as const };
    },
  });

  assert.equal(terminalResult, "confirmed");
});

test("fulfilled pre-effect failure releases the claim for a corrected retry", async () => {
  const first = await runPendingRequestResolution({
    family: "signature",
    requestId: "bad-password",
    action: "confirm",
    conflictResult,
    resolve: async () => ({ success: false as const, error: "Invalid password" }),
  });
  assert.deepEqual(first, { success: false, error: "Invalid password" });

  let retried = false;
  const retry = await runPendingRequestResolution({
    family: "signature",
    requestId: "bad-password",
    action: "confirm",
    conflictResult,
    resolve: async () => {
      retried = true;
      return { success: true as const };
    },
  });
  assert.equal(retried, true);
  assert.deepEqual(retry, { success: true });
});

test("unexpected resolver failure retains a fail-closed claim", async () => {
  await assert.rejects(
    runPendingRequestResolution({
      family: "batchTransaction",
      requestId: "ambiguous-broadcast",
      action: "confirm",
      conflictResult,
      resolve: async () => {
        throw new Error("RPC response lost after broadcast");
      },
    }),
    /response lost/,
  );

  let rejected = false;
  const second = await runPendingRequestResolution({
    family: "batchTransaction",
    requestId: "ambiguous-broadcast",
    action: "reject",
    conflictResult,
    resolve: async () => {
      rejected = true;
      return { success: true as const };
    },
  });
  assert.equal(rejected, false);
  assert.deepEqual(second, { success: false, error: "already confirm" });
});

test("service-worker reload can recover a still-persisted pre-effect request", async () => {
  const persisted = new Set(["reloaded-request"]);
  await assert.rejects(
    runPendingRequestResolution({
      family: "transaction",
      requestId: "reloaded-request",
      action: "confirm",
      conflictResult,
      resolve: async () => {
        throw new Error("worker interrupted before effect");
      },
    }),
  );

  // A worker restart clears only in-memory coordination; the durable pending
  // request is read again by the production resolver.
  resetPendingRequestResolutionClaimsForTests();
  const result = await runPendingRequestResolution({
    family: "transaction",
    requestId: "reloaded-request",
    action: "reject",
    conflictResult,
    resolve: async () => {
      assert.equal(persisted.delete("reloaded-request"), true);
      return { success: true as const };
    },
  });
  assert.deepEqual(result, { success: true });
  assert.equal(persisted.size, 0);
});

test("cancel can signal a winning confirm but cannot overtake reject or expiry", async () => {
  const confirmGate = deferred();
  const confirm = runPendingRequestResolution({
    family: "transaction",
    requestId: "cancel-confirm",
    action: "confirm",
    conflictResult,
    resolve: async () => {
      await confirmGate.promise;
      return { success: true as const };
    },
  });
  assert.equal(canSignalPendingTransactionCancellation("cancel-confirm"), true);
  confirmGate.resolve();
  await confirm;

  const rejectGate = deferred();
  const reject = runPendingRequestResolution({
    family: "transaction",
    requestId: "cancel-reject",
    action: "reject",
    conflictResult,
    resolve: async () => {
      await rejectGate.promise;
      return { success: true as const };
    },
  });
  assert.equal(canSignalPendingTransactionCancellation("cancel-reject"), false);
  rejectGate.resolve();
  await reject;

  const expiryGate = deferred();
  const expiry = runPendingRequestResolution({
    family: "transaction",
    requestId: "cancel-expiry",
    action: "expire",
    conflictResult,
    resolve: async () => {
      await expiryGate.promise;
      return { success: true as const };
    },
  });
  assert.equal(canSignalPendingTransactionCancellation("cancel-expiry"), false);
  expiryGate.resolve();
  await expiry;
});

test("moving a request atomically claims both source request and cross-dapp batch", async () => {
  const gate = deferred();
  let moved = 0;
  let sourceConfirmed = 0;
  let batchConfirmed = 0;

  const move = runPendingRequestResolutions({
    requests: [
      { family: "transaction", requestId: "move-source", action: "move" },
      { family: "crossDappBatch", requestId: "active", action: "move" },
    ],
    conflictResult: (_family, _requestId, winningAction) =>
      conflictResult(winningAction),
    resolve: async () => {
      moved += 1;
      await gate.promise;
      return { success: true as const };
    },
  });

  const sourceConfirm = runPendingRequestResolution({
    family: "transaction",
    requestId: "move-source",
    action: "confirm",
    conflictResult,
    resolve: async () => {
      sourceConfirmed += 1;
      return { success: true as const };
    },
  });
  const batchConfirm = runPendingRequestResolution({
    family: "crossDappBatch",
    requestId: "active",
    action: "confirm",
    conflictResult,
    resolve: async () => {
      batchConfirmed += 1;
      return { success: true as const };
    },
  });

  assert.deepEqual(await sourceConfirm, {
    success: false,
    error: "already move",
  });
  assert.deepEqual(await batchConfirm, {
    success: false,
    error: "already move",
  });
  assert.equal(sourceConfirmed, 0);
  assert.equal(batchConfirmed, 0);

  gate.resolve();
  assert.deepEqual(await move, { success: true });
  assert.equal(moved, 1);
});

test("an effect lease keeps reset blocked after the outer confirm resolver returns", async () => {
  let lease: ReturnType<typeof beginPendingRequestEffectLease> = null;
  const confirm = await runPendingRequestResolution({
    family: "transaction",
    requestId: "background-effect",
    action: "confirm",
    conflictResult,
    resolve: async () => {
      lease = beginPendingRequestEffectLease(
        "transaction",
        "background-effect",
      );
      assert.ok(lease);
      return { success: true as const };
    },
  });
  assert.deepEqual(confirm, { success: true });

  let resets = 0;
  const blockedReset = await runWalletResetAgainstPendingResolutions({
    conflictResult: () => ({ success: false as const, error: "busy" }),
    resolve: async () => {
      resets += 1;
      return { success: true as const };
    },
  });
  assert.deepEqual(blockedReset, { success: false, error: "busy" });
  assert.equal(resets, 0);

  lease?.release();
  const allowedReset = await runWalletResetAgainstPendingResolutions({
    conflictResult: () => ({ success: false as const, error: "busy" }),
    resolve: async () => {
      resets += 1;
      return { success: true as const };
    },
  });
  assert.deepEqual(allowedReset, { success: true });
  assert.equal(resets, 1);
});

test("a fire-and-forget internal processor transfers reset exclusion to its effect lease", async () => {
  const effectGate = deferred();
  let effects = 0;
  let lease: ReturnType<typeof beginPendingRequestEffectLease> = null;

  const queued = await runPendingRequestResolution({
    family: "internalOperation",
    requestId: "atomic-swap-background",
    action: "confirm",
    conflictResult,
    resolve: async () => {
      lease = beginPendingRequestEffectLease(
        "internalOperation",
        "atomic-swap-background",
      );
      assert.ok(lease);
      void (async () => {
        await effectGate.promise;
        effects += 1;
        lease?.release();
      })();
      return { success: true as const };
    },
  });
  assert.deepEqual(queued, { success: true });

  const reset = await runWalletResetAgainstPendingResolutions({
    conflictResult: () => ({ success: false as const, error: "busy" }),
    resolve: async () => ({ success: true as const }),
  });
  assert.deepEqual(reset, { success: false, error: "busy" });
  assert.equal(effects, 0);

  effectGate.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(effects, 1);
});

test("effect guard releases safe failures but retains an unknown remote outcome", async () => {
  const safeLease = beginPendingRequestEffectLease(
    "internalOperation",
    "safe-pre-effect",
  );
  assert.ok(safeLease);
  const safeGuard = guardPendingRequestEffectLease(safeLease);
  safeGuard.releaseIfSafe();
  assert.deepEqual(
    await runWalletResetAgainstPendingResolutions({
      conflictResult: () => ({ success: false as const, error: "busy" }),
      resolve: async () => ({ success: true as const }),
    }),
    { success: true },
  );

  const ambiguousLease = beginPendingRequestEffectLease(
    "internalOperation",
    "lost-response",
  );
  assert.ok(ambiguousLease);
  const ambiguousGuard = guardPendingRequestEffectLease(ambiguousLease);
  ambiguousGuard.beginEffect();
  ambiguousGuard.releaseIfSafe();
  assert.deepEqual(
    await runWalletResetAgainstPendingResolutions({
      conflictResult: () => ({ success: false as const, error: "busy" }),
      resolve: async () => ({ success: true as const }),
    }),
    { success: false, error: "busy" },
  );

  // A definitive remote response makes release safe again.
  ambiguousGuard.settleEffect();
  ambiguousGuard.releaseIfSafe();
  assert.deepEqual(
    await runWalletResetAgainstPendingResolutions({
      conflictResult: () => ({ success: false as const, error: "busy" }),
      resolve: async () => ({ success: true as const }),
    }),
    { success: true },
  );
});

for (const scenario of [
  { family: "transaction" as const, requestId: "reset-tx" },
  { family: "signature" as const, requestId: "reset-signature" },
  { family: "batchTransaction" as const, requestId: "reset-batch" },
  { family: "crossDappBatch" as const, requestId: "reset-cross" },
  { family: "internalOperation" as const, requestId: "reset-internal" },
]) {
  test(`${scenario.family}: an active resolution blocks reset`, async () => {
    const effectGate = deferred();
    let resets = 0;
    const effect = runPendingRequestResolution({
      family: scenario.family,
      requestId: scenario.requestId,
      action: "confirm",
      conflictResult,
      resolve: async () => {
        await effectGate.promise;
        return { success: true as const };
      },
    });

    const reset = await runWalletResetAgainstPendingResolutions({
      conflictResult: () => ({ success: false as const, error: "busy" }),
      resolve: async () => {
        resets += 1;
        return { success: true as const };
      },
    });
    assert.deepEqual(reset, { success: false, error: "busy" });
    assert.equal(resets, 0);

    effectGate.resolve();
    await effect;
  });

  test(`${scenario.family}: reset blocks a new resolution before its effect`, async () => {
    const resetGate = deferred();
    let effects = 0;
    const reset = runWalletResetAgainstPendingResolutions({
      conflictResult: () => ({ success: false as const, error: "busy" }),
      resolve: async () => {
        await resetGate.promise;
        return { success: true as const };
      },
    });

    const effect = await runPendingRequestResolution({
      family: scenario.family,
      requestId: scenario.requestId,
      action: "confirm",
      conflictResult,
      resolve: async () => {
        effects += 1;
        return { success: true as const };
      },
    });
    assert.deepEqual(effect, { success: false, error: "already reset" });
    assert.equal(effects, 0);

    resetGate.resolve();
    await reset;
  });
}
