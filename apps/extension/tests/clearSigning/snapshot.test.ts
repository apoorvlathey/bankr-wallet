import assert from "node:assert/strict";
import test from "node:test";
import type { ClearSignedMeta } from "../../src/chrome/history/types";
import type { ClearSignedMetaBuilders } from "../../src/chrome/clearSigning/snapshot";

const TO = `0x${"a".repeat(40)}`;
const approveMeta: ClearSignedMeta = { kind: "approve", tokenSymbol: "USDC" };
const transferMeta: ClearSignedMeta = {
  kind: "transfer",
  tokenSymbol: "USDC",
};
const nativeMeta: ClearSignedMeta = { kind: "nativeSend", tokenSymbol: "ETH" };
const erc7730Meta: ClearSignedMeta = {
  kind: "erc7730",
  intent: "Swap tokens",
};

function builders(
  events: string[],
  results: Partial<
    Record<keyof ClearSignedMetaBuilders, ClearSignedMeta | null | Error>
  >,
): ClearSignedMetaBuilders {
  const build = (name: keyof ClearSignedMetaBuilders) => async () => {
    events.push(name);
    const result = results[name] ?? null;
    if (result instanceof Error) throw result;
    return result;
  };
  return {
    approve: build("approve"),
    transfer: build("transfer"),
    nativeSend: build("nativeSend"),
    erc7730: build("erc7730"),
  } as ClearSignedMetaBuilders;
}

test("snapshot priority remains approve, transfer, native, then ERC-7730", async () => {
  const { buildClearSignedMetaWithBuilders } = await import(
    "../../src/chrome/clearSigning/snapshot"
  );

  let events: string[] = [];
  assert.equal(
    await buildClearSignedMetaWithBuilders(
      { to: TO, data: "0x12345678" },
      1,
      builders(events, { approve: approveMeta, erc7730: erc7730Meta }),
    ),
    approveMeta,
  );
  assert.deepEqual(events, ["approve"]);

  events = [];
  assert.equal(
    await buildClearSignedMetaWithBuilders(
      { to: TO, data: "0x12345678" },
      1,
      builders(events, { transfer: transferMeta, erc7730: erc7730Meta }),
    ),
    transferMeta,
  );
  assert.deepEqual(events, ["approve", "transfer"]);

  events = [];
  assert.equal(
    await buildClearSignedMetaWithBuilders(
      { to: TO, data: "0x", value: "1" },
      1,
      builders(events, { nativeSend: nativeMeta, erc7730: erc7730Meta }),
    ),
    nativeMeta,
  );
  assert.deepEqual(events, ["approve", "transfer", "nativeSend"]);

  events = [];
  assert.equal(
    await buildClearSignedMetaWithBuilders(
      { to: TO, data: "0x12345678" },
      1,
      builders(events, { erc7730: erc7730Meta }),
    ),
    erc7730Meta,
  );
  assert.deepEqual(events, ["approve", "transfer", "erc7730"]);
});

test("snapshot failures and invalid recipients return null without fallthrough", async () => {
  const { buildClearSignedMetaWithBuilders } = await import(
    "../../src/chrome/clearSigning/snapshot"
  );
  let events: string[] = [];
  assert.equal(
    await buildClearSignedMetaWithBuilders(
      { to: TO, data: "0x12345678" },
      1,
      builders(events, {
        approve: new Error("metadata failed"),
        erc7730: erc7730Meta,
      }),
    ),
    null,
  );
  assert.deepEqual(events, ["approve"]);

  events = [];
  assert.equal(
    await buildClearSignedMetaWithBuilders(
      { to: "not-an-address", data: "0x12345678" },
      1,
      builders(events, { approve: approveMeta }),
    ),
    null,
  );
  assert.deepEqual(events, []);

  events = [];
  assert.equal(
    await buildClearSignedMetaWithBuilders(
      { to: TO, data: "0x", value: "0" },
      1,
      builders(events, { erc7730: erc7730Meta }),
    ),
    null,
  );
  assert.deepEqual(events, ["approve", "transfer", "nativeSend"]);
});

test("remote matches win; misses/errors use built-ins unless opted out", async () => {
  const { resolveMatchedCalldataDescriptorWithDependencies } = await import(
    "../../src/chrome/clearSigning/erc7730Snapshot"
  );
  const remote = { metadata: { contractName: "Remote" } };
  const local = { metadata: { contractName: "Builtin" } };
  const remoteMatch = { formatKey: "remote()", format: { intent: "Remote" } };
  const localMatch = { formatKey: "local()", format: { intent: "Local" } };

  let builtinCalls = 0;
  let result = await resolveMatchedCalldataDescriptorWithDependencies(
    TO,
    "0x12345678",
    1,
    {
      getDescriptor: async () => ({ descriptor: remote, enabled: true }),
      getBuiltin: () => {
        builtinCalls += 1;
        return local;
      },
      match: (descriptor) => (descriptor === remote ? remoteMatch : localMatch),
    },
  );
  assert.equal(result?.descriptor, remote);
  assert.equal(result?.match, remoteMatch);
  assert.equal(builtinCalls, 0);

  result = await resolveMatchedCalldataDescriptorWithDependencies(
    TO,
    "0x12345678",
    1,
    {
      getDescriptor: async () => ({ descriptor: remote, enabled: true }),
      getBuiltin: () => local,
      match: (descriptor) => (descriptor === local ? localMatch : null),
    },
  );
  assert.equal(result?.descriptor, local);

  result = await resolveMatchedCalldataDescriptorWithDependencies(
    TO,
    "0x12345678",
    1,
    {
      getDescriptor: async () => {
        throw new Error("worker unavailable");
      },
      getBuiltin: () => local,
      match: () => localMatch,
    },
  );
  assert.equal(result?.descriptor, local);

  builtinCalls = 0;
  result = await resolveMatchedCalldataDescriptorWithDependencies(
    TO,
    "0x12345678",
    1,
    {
      getDescriptor: async () => ({ descriptor: null, enabled: false }),
      getBuiltin: () => {
        builtinCalls += 1;
        return local;
      },
      match: () => localMatch,
    },
  );
  assert.equal(result, null);
  assert.equal(builtinCalls, 0);
});

test("history attachment is fire-and-forget and swallows build/write failures", async () => {
  const { attachClearSignedMetaToHistoryWithDependencies } = await import(
    "../../src/chrome/clearSigning/historyAttachment"
  );
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const updates: unknown[] = [];
  let release!: (meta: ClearSignedMeta | null) => void;
  const pending = new Promise<ClearSignedMeta | null>((resolve) => {
    release = resolve;
  });
  const returned = attachClearSignedMetaToHistoryWithDependencies(
    "tx-1",
    { to: TO },
    8453,
    {
      build: async () => pending,
      update: async (...args) => {
        updates.push(args);
      },
    },
  );
  assert.equal(returned, undefined);
  assert.deepEqual(updates, []);
  release(nativeMeta);
  await tick();
  assert.deepEqual(updates, [
    ["tx-1", { clearSignedMeta: nativeMeta }],
  ]);

  attachClearSignedMetaToHistoryWithDependencies("tx-2", { to: TO }, 1, {
    build: async () => {
      throw new Error("build failed");
    },
    update: async () => {
      throw new Error("must not run");
    },
  });
  attachClearSignedMetaToHistoryWithDependencies("tx-3", { to: TO }, 1, {
    build: async () => nativeMeta,
    update: async () => {
      throw new Error("write failed");
    },
  });
  await tick();
});
