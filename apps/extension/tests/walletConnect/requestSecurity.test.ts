import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_HEX_DATA_CHARS,
  MAX_SIGNATURE_PAYLOAD_CHARS,
} from "../../src/chrome/providerRequestLimits";
import { validateWalletConnectRequestPayload } from "../../src/chrome/walletConnectRequestValidation";
import {
  chainIdFromCaip2,
  getSessionMetadata,
  parseWalletChainId,
  sessionSupportsMethod,
} from "../../src/chrome/walletConnectHelpers";
import {
  rejectUnroutedSessionRequest,
  respondSessionRequest,
} from "../../src/chrome/walletConnectProtocol";
import { flushWalletConnectTerminalResponses } from "../../src/chrome/walletConnectOutbox";
import {
  MAX_WALLETCONNECT_PENDING_REQUESTS,
  MAX_WALLETCONNECT_PENDING_REQUESTS_PER_TOPIC,
  claimWalletConnectRemoteRequest,
  clearExpiredWalletConnectPendingRequests,
  getWalletConnectPendingRequests,
  saveWalletConnectTerminalResponse,
  saveWalletConnectPendingRequest,
  withWalletConnectPendingRoute,
  type WalletConnectPendingRequest,
} from "../../src/chrome/walletConnectStorage";

function route(
  id: string,
  topic = "topic-a",
  timestamp = Date.now(),
): WalletConnectPendingRequest {
  const digits = id.replace(/\D/g, "");
  return {
    id,
    kind: "transaction",
    topic,
    requestId: digits ? Number(digits) + 1 : 1,
    method: "eth_sendTransaction",
    timestamp,
  };
}

test("WalletConnect request ingress shares provider resource limits", () => {
  const address = "0x0000000000000000000000000000000000000001";
  assert.deepEqual(
    validateWalletConnectRequestPayload("eth_sendTransaction", [
      { from: address, data: `0x${"0".repeat(MAX_HEX_DATA_CHARS - 2)}` },
    ]),
    { valid: true },
  );
  assert.match(
    validateWalletConnectRequestPayload("eth_sendTransaction", [
      { from: address, data: `0x${"0".repeat(MAX_HEX_DATA_CHARS - 1)}` },
    ]).error || "",
    /transaction data/i,
  );
  assert.match(
    validateWalletConnectRequestPayload("personal_sign", [
      "x".repeat(MAX_SIGNATURE_PAYLOAD_CHARS),
      address,
    ]).error || "",
    /signature request/i,
  );
  assert.equal(
    validateWalletConnectRequestPayload("personal_sign", {
      message: "not positional params",
    }).valid,
    false,
  );

  const call = { to: address, data: "0x" };
  assert.equal(
    validateWalletConnectRequestPayload("wallet_sendCalls", [
      {
        version: "2.0.0",
        chainId: "0x1",
        calls: Array.from({ length: 100 }, () => ({ ...call })),
      },
    ]).valid,
    true,
  );
  assert.match(
    validateWalletConnectRequestPayload("wallet_sendCalls", [
      {
        version: "2.0.0",
        chainId: "0x1",
        calls: Array.from({ length: 101 }, () => ({ ...call })),
      },
    ]).error || "",
    /call count/i,
  );
  assert.match(
    validateWalletConnectRequestPayload("wallet_sendCalls", [
      {
        version: "2.0.0",
        chainId: "0x1",
        calls: [
          { ...call, data: `0x${"0".repeat(MAX_HEX_DATA_CHARS - 1)}` },
        ],
      },
    ]).error || "",
    /batch transaction data/i,
  );
});

test("WalletConnect accepts only methods approved in the session namespace", () => {
  const session = {
    namespaces: {
      eip155: { methods: ["eth_sendTransaction", "personal_sign"] },
    },
  };
  assert.equal(sessionSupportsMethod(session, "eth_sendTransaction"), true);
  assert.equal(sessionSupportsMethod(session, "personal_sign"), true);
  assert.equal(sessionSupportsMethod(session, "eth_sendRawTransaction"), false);
  assert.equal(sessionSupportsMethod(session, "eth_blockNumber"), false);
  assert.equal(sessionSupportsMethod({}, "eth_sendTransaction"), false);
});

test("WalletConnect peer metadata is bounded and unsafe URLs are discarded", () => {
  const metadata = getSessionMetadata({
    peer: {
      metadata: {
        name: "n".repeat(500),
        description: "d".repeat(1_000),
        url: "javascript:alert(1)",
        icons: [
          "javascript:alert(1)",
          ...Array.from(
            { length: 8 },
            (_, index) => `https://cdn.example/icon-${index}.png`,
          ),
        ],
      },
    },
  });
  assert.equal(metadata.name.length, 200);
  assert.equal(metadata.description?.length, 500);
  assert.equal(metadata.url, "");
  assert.equal(metadata.icons.length, 4);
  assert.ok(metadata.icons.every((icon) => icon.startsWith("https://")));
});

test("WalletConnect chain parsers reject partial and unsafe numeric coercion", () => {
  assert.equal(chainIdFromCaip2("eip155:1"), 1);
  assert.equal(parseWalletChainId("0x2105"), 8453);
  for (const value of [
    "cosmos:1",
    "eip155:1:extra",
    "eip155:0",
    "eip155:01",
    `eip155:${Number.MAX_SAFE_INTEGER + 1}`,
  ]) {
    assert.equal(chainIdFromCaip2(value), null);
  }
  for (const value of ["0x1junk", "0x", "01", "0", "-1", "1.5"]) {
    assert.equal(parseWalletChainId(value), null);
  }
});

test("WalletConnect signature ingress rejects malformed messages and signers", () => {
  const address = "0x0000000000000000000000000000000000000001";
  assert.deepEqual(
    validateWalletConnectRequestPayload("personal_sign", ["hello", address]),
    { valid: true },
  );
  for (const params of [
    ["0x0", address],
    ["0xzz", address],
    ["hello", "0x1234"],
    [123, address],
  ]) {
    assert.equal(
      validateWalletConnectRequestPayload("personal_sign", params).valid,
      false,
    );
  }
});

test("WalletConnect transactions fail closed before account and contract-creation coercion", () => {
  const address = "0x0000000000000000000000000000000000000001";
  const transaction = {
    from: address,
    to: address,
    chainId: "0x1",
    data: "0x1234",
    value: "0x1",
    gas: "0x5208",
  };
  assert.deepEqual(
    validateWalletConnectRequestPayload("eth_sendTransaction", [transaction]),
    { valid: true },
  );
  assert.deepEqual(
    validateWalletConnectRequestPayload("eth_sendTransaction", [
      { ...transaction, value: "0x00" },
    ]),
    { valid: true },
  );
  assert.deepEqual(
    validateWalletConnectRequestPayload("eth_sendTransaction", [
      { ...transaction, from: undefined, to: null },
    ]),
    { valid: true },
  );

  for (const [field, value, error] of [
    ["from", "not-an-address", /from.*valid address/i],
    ["to", "not-an-address", /to.*valid address/i],
    ["data", "0x123", /transaction data/i],
    ["data", "0xno", /transaction data/i],
    ["value", "0x1" + "0".repeat(64), /value.*too large/i],
    ["gas", "1e18", /gas.*non-negative integer/i],
    ["gasPrice", {}, /gasPrice.*integer string/i],
    ["maxFeePerGas", "-1", /maxFeePerGas.*non-negative integer/i],
    ["maxPriorityFeePerGas", "0x", /maxPriorityFeePerGas.*non-negative integer/i],
    ["chainId", "0x1junk", /chainId.*invalid/i],
    ["chainId", "0x0", /chainId.*invalid/i],
  ] as const) {
    const result = validateWalletConnectRequestPayload("eth_sendTransaction", [
      { ...transaction, [field]: value },
    ]);
    assert.equal(result.valid, false);
    assert.match(result.error || "", error);
  }
});

test("WalletConnect pending routes are compensated, bounded, and pruned", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const storage: Record<string, unknown> = {};
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string | string[]) {
            if (Array.isArray(key)) {
              return Object.fromEntries(key.map((item) => [item, storage[item]]));
            }
            return { [key]: storage[key] };
          },
          async set(values: Record<string, unknown>) {
            Object.assign(storage, values);
          },
        },
      },
    },
  });

  try {
    await t.test("removes a route when pending persistence fails", async () => {
      storage.walletConnectPendingRequests = {};
      await assert.rejects(
        withWalletConnectPendingRoute(route("route-1"), async () => {
          throw new Error("pending store full");
        }),
        /pending store full/i,
      );
      assert.deepEqual(await getWalletConnectPendingRequests(), {});
    });

    await t.test("enforces per-topic and global route caps", async () => {
      storage.walletConnectPendingRequests = {};
      for (let index = 0; index < MAX_WALLETCONNECT_PENDING_REQUESTS_PER_TOPIC; index += 1) {
        await saveWalletConnectPendingRequest(route(`topic-${index}`, "one-topic"));
      }
      await assert.rejects(
        saveWalletConnectPendingRequest(
          route("topic-overflow-999", "one-topic"),
        ),
        /session has too many/i,
      );

      storage.walletConnectPendingRequests = Object.fromEntries(
        Array.from({ length: MAX_WALLETCONNECT_PENDING_REQUESTS }, (_, index) => {
          const item = route(`global-${index}`, `topic-${index}`);
          return [item.id, item];
        }),
      );
      await assert.rejects(
        saveWalletConnectPendingRequest(route("global-overflow", "new-topic")),
        /too many pending WalletConnect/i,
      );
    });

    await t.test("claims each remote topic and request id exactly once", async () => {
      storage.walletConnectPendingRequests = {};
      const [first, second] = await Promise.all([
        claimWalletConnectRemoteRequest(
          "dedupe-topic",
          41,
          "eth_sendTransaction",
        ),
        claimWalletConnectRemoteRequest(
          "dedupe-topic",
          41,
          "eth_sendTransaction",
        ),
      ]);
      const winner = first.acquired ? first : second;
      const duplicate = first.acquired ? second : first;
      assert.equal(winner.acquired, true);
      assert.equal(duplicate.acquired, false);
      if (!winner.acquired || duplicate.acquired) {
        assert.fail("expected exactly one remote request claim");
      }
      assert.equal(duplicate.existing.id, winner.claimId);
      assert.equal(duplicate.existing.kind, "claim");

      const otherTopic = await claimWalletConnectRemoteRequest(
        "another-dedupe-topic",
        41,
        "eth_sendTransaction",
      );
      assert.equal(otherTopic.acquired, true);
    });

    await t.test("transfers one claim to tx, signature, and permission routes", async () => {
      for (const [kind, method] of [
        ["transaction", "eth_sendTransaction"],
        ["signature", "personal_sign"],
        ["erc7715Permission", "wallet_requestExecutionPermissions"],
      ] as const) {
        storage.walletConnectPendingRequests = {};
        const claim = await claimWalletConnectRemoteRequest(
          "route-topic",
          52,
          method,
        );
        assert.equal(claim.acquired, true);
        if (!claim.acquired) assert.fail("claim unexpectedly lost");
        const pending: WalletConnectPendingRequest = {
          id: `${kind}-internal-id`,
          kind,
          topic: "route-topic",
          requestId: 52,
          method,
          timestamp: Date.now(),
        };
        let persisted = 0;
        await withWalletConnectPendingRoute(
          pending,
          async () => {
            persisted += 1;
          },
          claim.claimId,
        );
        assert.equal(persisted, 1);
        assert.deepEqual(await getWalletConnectPendingRequests(), {
          [pending.id]: pending,
        });
        const duplicate = await claimWalletConnectRemoteRequest(
          "route-topic",
          52,
          method,
        );
        assert.equal(duplicate.acquired, false);
      }
    });

    await t.test("an unrouted malformed duplicate cannot poison the owner route", async () => {
      storage.walletConnectPendingRequests = {};
      const owner = route("owner-66", "owner-topic");
      owner.requestId = 66;
      await saveWalletConnectPendingRequest(owner);
      const responses: any[] = [];
      await rejectUnroutedSessionRequest(
        {
          getActiveSessions: () => ({ "owner-topic": {} }),
          async respondSessionRequest(value: any) {
            responses.push(value);
          },
        },
        { topic: "owner-topic", id: 66 },
        -32602,
        "Malformed duplicate",
      );
      assert.equal(responses[0].response.error.code, -32602);
      assert.deepEqual(await getWalletConnectPendingRequests(), {
        [owner.id]: owner,
      });
    });

    await t.test("retains and replays the first terminal response after relay failure", async () => {
      storage.walletConnectPendingRequests = {};
      const claim = await claimWalletConnectRemoteRequest(
        "batch-topic",
        63,
        "wallet_sendCalls",
      );
      assert.equal(claim.acquired, true);

      const failedResponses: any[] = [];
      const failingKit = {
        getActiveSessions: () => ({ "batch-topic": {} }),
        async respondSessionRequest(value: any) {
          failedResponses.push(value);
          throw new Error("relay unavailable");
        },
      };
      await assert.rejects(
        respondSessionRequest(
          failingKit,
          { topic: "batch-topic", id: 63 },
          { id: "bundle-1" },
        ),
        /relay unavailable/i,
      );

      const retained = Object.values(await getWalletConnectPendingRequests());
      assert.equal(retained.length, 1);
      assert.equal(retained[0].terminalResponse?.kind, "result");
      if (retained[0].terminalResponse?.kind !== "result") {
        assert.fail("terminal result was not retained");
      }
      assert.deepEqual(retained[0].terminalResponse.value, { id: "bundle-1" });

      // A conflicting terminal write cannot replace the committed bundle id.
      await saveWalletConnectTerminalResponse("batch-topic", 63, {
        kind: "error",
        code: -32000,
        message: "conflicting failure",
      });
      const stillFirst = Object.values(
        await getWalletConnectPendingRequests(),
      )[0];
      assert.equal(stillFirst.terminalResponse?.kind, "result");

      const duplicate = await claimWalletConnectRemoteRequest(
        "batch-topic",
        63,
        "wallet_sendCalls",
      );
      assert.equal(duplicate.acquired, false);
      if (duplicate.acquired) assert.fail("terminal outbox was not deduped");

      const replayedResponses: any[] = [];
      const recoveredKit = {
        getActiveSessions: () => ({ "batch-topic": {} }),
        async respondSessionRequest(value: any) {
          replayedResponses.push(value);
        },
      };
      await flushWalletConnectTerminalResponses(recoveredKit);
      assert.deepEqual(replayedResponses, failedResponses);
      assert.deepEqual(await getWalletConnectPendingRequests(), {});
    });

    await t.test("drops a terminal outbox only after the session is confirmed absent", async () => {
      storage.walletConnectPendingRequests = {};
      const claim = await claimWalletConnectRemoteRequest(
        "ended-topic",
        64,
        "wallet_sendCalls",
      );
      assert.equal(claim.acquired, true);

      let deliveryAttempts = 0;
      await assert.rejects(
        respondSessionRequest(
          {
            getActiveSessions: () => ({ "ended-topic": {} }),
            async respondSessionRequest() {
              deliveryAttempts += 1;
              throw new Error("relay unavailable");
            },
          },
          { topic: "ended-topic", id: 64 },
          { id: "bundle-ended" },
        ),
        /relay unavailable/i,
      );
      assert.equal(
        Object.values(await getWalletConnectPendingRequests()).length,
        1,
      );

      await flushWalletConnectTerminalResponses({
        getActiveSessions: () => ({}),
        async respondSessionRequest() {
          deliveryAttempts += 1;
        },
      });
      assert.equal(deliveryAttempts, 1);
      assert.deepEqual(await getWalletConnectPendingRequests(), {});
    });

    await t.test("rejects an oversized terminal response without releasing its claim", async () => {
      storage.walletConnectPendingRequests = {};
      const claim = await claimWalletConnectRemoteRequest(
        "oversized-topic",
        65,
        "eth_accounts",
      );
      assert.equal(claim.acquired, true);
      await assert.rejects(
        respondSessionRequest(
          {
            getActiveSessions: () => ({ "oversized-topic": {} }),
            async respondSessionRequest() {
              assert.fail("oversized response must not reach the relay");
            },
          },
          { topic: "oversized-topic", id: 65 },
          "x".repeat(1_000_001),
        ),
        /safe limits/i,
      );
      const retained = Object.values(
        await getWalletConnectPendingRequests(),
      );
      assert.equal(retained.length, 1);
      assert.equal(retained[0].kind, "claim");
      assert.equal(retained[0].terminalResponse, undefined);
    });

    await t.test("periodic cleanup removes expired and malformed routes", async () => {
      const active = route("active", "topic-active");
      const expired = route(
        "expired",
        "topic-expired",
        Date.now() - 31 * 60 * 1000,
      );
      storage.walletConnectPendingRequests = {
        [active.id]: active,
        [expired.id]: expired,
        malformed: { topic: "missing fields" },
      };
      await clearExpiredWalletConnectPendingRequests();
      assert.deepEqual(await getWalletConnectPendingRequests(), {
        [active.id]: active,
      });
      assert.deepEqual(storage.walletConnectPendingRequests, {
        [active.id]: active,
      });
    });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
