import assert from "node:assert/strict";
import test from "node:test";

import { EIP_7702_DEFAULT_DELEGATE } from "../../src/constants/chainRegistry";
import { STALE_MASTER_AUTHORIZATION_ERROR } from "../../src/chrome/masterAuthorization";
import { createGetDelegationStatusHandler } from "../../src/chrome/delegation/status";
import { createProbeDelegateContractHandler } from "../../src/chrome/delegation/probe";
import {
  createInitiateSetDelegationHandler,
  type SetDelegationDependencies,
} from "../../src/chrome/delegation/setRequest";
import {
  createInitiateRevokeDelegationHandler,
  type RevokeDelegationDependencies,
} from "../../src/chrome/delegation/revokeRequest";
import type { PinnedTxRequest } from "../../src/chrome/requests/pendingTxStorage";

const PRIVATE_ACCOUNT = {
  id: "private-1",
  type: "privateKey" as const,
  address: "0xAa00000000000000000000000000000000000001",
  createdAt: 1,
};
const SEED_ACCOUNT = {
  id: "seed-1",
  type: "seedPhrase" as const,
  address: "0xBb00000000000000000000000000000000000002",
  seedGroupId: "seed-group",
  derivationIndex: 0,
  createdAt: 1,
};
const CUSTOM = "0xcc00000000000000000000000000000000000003";

function setDependencies(
  overrides: Partial<SetDelegationDependencies> = {},
): SetDelegationDependencies {
  const timestamps = [100, 200];
  return {
    getAccountById: async () => PRIVATE_ACCOUNT,
    getStoredResolvedChainById: async () =>
      ({ name: "Base", rpcUrl: "https://rpc.example" }) as never,
    captureEip7702DelegationAuthorization: async () => undefined,
    probeErc7821Support: async () => ({ ok: true, supports: true }),
    queueDelegationRequest: async () => {},
    now: () => timestamps.shift() ?? 999,
    ...overrides,
  } as SetDelegationDependencies;
}

function revokeDependencies(
  overrides: Partial<RevokeDelegationDependencies> = {},
): RevokeDelegationDependencies {
  const timestamps = [300, 400];
  return {
    getAccountById: async () => SEED_ACCOUNT,
    getStoredResolvedChainById: async () =>
      ({ name: "Ethereum", rpcUrl: "https://rpc.example" }) as never,
    queueDelegationRequest: async () => {},
    now: () => timestamps.shift() ?? 999,
    ...overrides,
  } as RevokeDelegationDependencies;
}

test("canonical default Set stays agent-capable, skips probe, and queues exact request", async () => {
  let capturedMeta: unknown;
  let queued: { request: PinnedTxRequest; epoch?: string } | undefined;
  const handler = createInitiateSetDelegationHandler(
    setDependencies({
      getAccountById: async () => SEED_ACCOUNT,
      captureEip7702DelegationAuthorization: async (meta) => {
        capturedMeta = meta;
        return undefined;
      },
      probeErc7821Support: async () => {
        throw new Error("canonical default must not be probed");
      },
      queueDelegationRequest: async (request, epoch) => {
        queued = { request, epoch };
      },
    }),
  );
  const result = await handler("seed-1", 8453, EIP_7702_DEFAULT_DELEGATE);
  assert.deepEqual(result, {
    success: true,
    txId: "setDelegate7702:seed-1:8453:100",
  });
  assert.deepEqual(capturedMeta, {
    targetDelegate: EIP_7702_DEFAULT_DELEGATE,
    kind: "setDelegate",
  });
  assert.equal(queued?.epoch, undefined);
  assert.equal(queued?.request.timestamp, 200);
  assert.equal(queued?.request.accountType, "seedPhrase");
});

test("custom Set captures master epoch, re-probes ERC-7821, then queues under that epoch", async () => {
  const events: string[] = [];
  let queuedEpoch: string | undefined;
  const handler = createInitiateSetDelegationHandler(
    setDependencies({
      getAccountById: async () => {
        events.push("account");
        return PRIVATE_ACCOUNT;
      },
      captureEip7702DelegationAuthorization: async () => {
        events.push("capture");
        return "master-epoch";
      },
      getStoredResolvedChainById: async () => {
        events.push("chain");
        return { name: "Base", rpcUrl: "https://rpc.example" } as never;
      },
      probeErc7821Support: async (rpcUrl, chainId, target) => {
        events.push(`probe:${rpcUrl}:${chainId}:${target}`);
        return { ok: true, supports: true };
      },
      queueDelegationRequest: async (_request, epoch) => {
        events.push("queue");
        queuedEpoch = epoch;
      },
    }),
  );
  assert.deepEqual(await handler("private-1", 8453, CUSTOM), {
    success: true,
    txId: "setDelegate7702:private-1:8453:100",
  });
  assert.deepEqual(events, [
    "account",
    "capture",
    "chain",
    `probe:https://rpc.example:8453:${CUSTOM}`,
    "queue",
  ]);
  assert.equal(queuedEpoch, "master-epoch");
});

test("Set rejects non-local accounts, invalid targets, zero, failed auth, and incompatible contracts", async () => {
  for (const type of ["bankr", "impersonator"] as const) {
    const handler = createInitiateSetDelegationHandler(
      setDependencies({
        getAccountById: async () => ({ ...PRIVATE_ACCOUNT, type }) as never,
        captureEip7702DelegationAuthorization: async () => {
          throw new Error("must not capture");
        },
      }),
    );
    assert.match((await handler("id", 1, CUSTOM)).error ?? "", /Only PK and Seed Phrase/);
  }

  const base = createInitiateSetDelegationHandler(setDependencies());
  assert.deepEqual(await base("private-1", 1, "bad"), {
    success: false,
    error: "Invalid delegate address",
  });
  assert.match(
    (await base("private-1", 1, "0x0000000000000000000000000000000000000000")).error ?? "",
    /Use Revoke/,
  );

  const denied = createInitiateSetDelegationHandler(
    setDependencies({
      captureEip7702DelegationAuthorization: async () => {
        throw new Error("master denied");
      },
      getStoredResolvedChainById: async () => {
        throw new Error("must not resolve after denied auth");
      },
    }),
  );
  assert.deepEqual(await denied("private-1", 1, CUSTOM), {
    success: false,
    error: "master denied",
  });

  const incompatible = createInitiateSetDelegationHandler(
    setDependencies({
      captureEip7702DelegationAuthorization: async () => "epoch",
      probeErc7821Support: async () => ({ ok: true, supports: false }),
    }),
  );
  assert.match(
    (await incompatible("private-1", 1, CUSTOM)).error ?? "",
    /does not implement ERC-7821/,
  );
});

test("stale master epoch is returned without turning other queue failures into UI errors", async () => {
  const stale = createInitiateSetDelegationHandler(
    setDependencies({
      captureEip7702DelegationAuthorization: async () => "epoch",
      queueDelegationRequest: async () => {
        throw new Error(STALE_MASTER_AUTHORIZATION_ERROR);
      },
    }),
  );
  assert.deepEqual(await stale("private-1", 1, CUSTOM), {
    success: false,
    error: STALE_MASTER_AUTHORIZATION_ERROR,
  });

  const storageFailure = createInitiateSetDelegationHandler(
    setDependencies({
      queueDelegationRequest: async () => {
        throw new Error("storage failed");
      },
    }),
  );
  await assert.rejects(
    storageFailure("private-1", 1, EIP_7702_DEFAULT_DELEGATE),
    /storage failed/,
  );
});

test("revoke is PK/seed-only and queues an agent-capable zero-delegate request", async () => {
  let queued: PinnedTxRequest | undefined;
  const handler = createInitiateRevokeDelegationHandler(
    revokeDependencies({
      queueDelegationRequest: async (request, epoch) => {
        assert.equal(epoch, undefined);
        queued = request;
      },
    }),
  );
  assert.deepEqual(await handler("seed-1", 1), {
    success: true,
    txId: "revoke7702:seed-1:1:300",
  });
  assert.equal(queued?.timestamp, 400);
  assert.deepEqual(queued?.delegation7702Meta, {
    targetDelegate: "0x0000000000000000000000000000000000000000",
    kind: "revoke",
  });

  for (const type of ["bankr", "impersonator"] as const) {
    const rejected = createInitiateRevokeDelegationHandler(
      revokeDependencies({
        getAccountById: async () => ({ ...PRIVATE_ACCOUNT, type }) as never,
        getStoredResolvedChainById: async () => {
          throw new Error("must not resolve");
        },
      }),
    );
    assert.match((await rejected("id", 1)).error ?? "", /Only PK and Seed Phrase/);
  }
});

test("status and probe handlers preserve onchain/default mapping and exact probe errors", async () => {
  const status = createGetDelegationStatusHandler({
    getAccountById: async () => PRIVATE_ACCOUNT,
    getStoredResolvedChainById: async () =>
      ({ rpcUrl: "https://rpc.example" }) as never,
    resolveActiveDelegate: async (input) => {
      assert.deepEqual(input, {
        accountId: "private-1",
        accountAddress: PRIVATE_ACCOUNT.address,
        chainId: 8453,
        rpcUrl: "https://rpc.example",
      });
      return {
        delegate: CUSTOM,
        source: "onchain",
        needsAuthorization: false,
        onchainDelegate: CUSTOM,
        customDelegate: CUSTOM,
      } as never;
    },
  });
  assert.deepEqual(await status("private-1", 8453), {
    success: true,
    delegate: CUSTOM,
    source: "onchain",
    needsAuthorization: false,
    onchainDelegate: CUSTOM,
    customDelegate: CUSTOM,
  });

  const probe = createProbeDelegateContractHandler({
    getStoredResolvedChainById: async () =>
      ({ rpcUrl: "https://rpc.example" }) as never,
    probeErc7821Support: async (_rpc, _chain, address) => {
      assert.equal(address, CUSTOM.toLowerCase());
      return { ok: false, error: "offline" };
    },
  });
  assert.deepEqual(await probe(8453, CUSTOM), {
    success: false,
    error: "Couldn't probe contract: offline",
  });
  assert.deepEqual(await probe(8453, "bad"), {
    success: false,
    error: "Invalid address",
  });
});
