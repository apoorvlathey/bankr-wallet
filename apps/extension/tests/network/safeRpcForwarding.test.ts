import assert from "node:assert/strict";
import test from "node:test";

import {
  handleSafeRpcRequest,
  isSafeRpcForwardingMethod,
} from "../../src/chrome/safeRpcForwarding";
import { forwardSafeRpcRequest as forwardWalletConnectRpc } from "../../src/chrome/walletConnectRpcRequestHandlers";

const RPC_URL = "https://rpc.example";

function rpcResponse(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("the provider RPC proxy enforces method, target, size, and concurrency limits", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let lastFetchInit: RequestInit | undefined;
  let fetchHandler: () => Promise<Response> = async () => rpcResponse("0x1");
  let networksInfo: Record<string, any> = {
    Ethereum: { chainId: 1, rpcUrl: RPC_URL },
  };

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        sync: {
          async get() {
            return {
              networksInfo,
            };
          },
        },
      },
    },
  });
  globalThis.fetch = (async (_input, init) => {
    fetchCalls += 1;
    lastFetchInit = init;
    return fetchHandler();
  }) as typeof fetch;

  try {
    await t.test("allows a configured endpoint and public read method", async () => {
      assert.equal(isSafeRpcForwardingMethod("eth_getBalance"), true);
      assert.equal(
        await handleSafeRpcRequest(RPC_URL, "eth_getBalance", [
          "0x0000000000000000000000000000000000000000",
          "latest",
        ]),
        "0x1",
      );
      assert.equal(lastFetchInit?.redirect, "error");
    });

    await t.test("WalletConnect uses the same bounded forwarding path", async () => {
      assert.equal(
        await forwardWalletConnectRpc(1, "eth_blockNumber", []),
        "0x1",
      );

      const before = fetchCalls;
      networksInfo = {
        Ethereum: { chainId: 1, rpcUrl: "http://127.0.0.1:8545" },
      };
      await assert.rejects(
        forwardWalletConnectRpc(1, "eth_blockNumber", []),
        /Private-network RPC access/i,
      );
      assert.equal(fetchCalls, before);
      networksInfo = {
        Ethereum: { chainId: 1, rpcUrl: RPC_URL },
      };
    });

    await t.test("blocks IPv4-mapped IPv6 private RPC literals", async () => {
      const before = fetchCalls;
      for (const rpcUrl of [
        "http://[::ffff:127.0.0.1]:8545",
        "http://[::ffff:7f00:1]:8545",
        "http://[::ffff:a9fe:a9fe]:8545",
        "http://[fec0::1]:8545",
      ]) {
        networksInfo = { Ethereum: { chainId: 1, rpcUrl } };
        await assert.rejects(
          handleSafeRpcRequest(rpcUrl, "eth_blockNumber", []),
          /Private-network RPC access/i,
          rpcUrl,
        );
      }
      assert.equal(fetchCalls, before);
      networksInfo = { Ethereum: { chainId: 1, rpcUrl: RPC_URL } };
    });

    await t.test("blocks submission, signing, debug, and filter methods", async () => {
      const before = fetchCalls;
      for (const method of [
        "eth_sendRawTransaction",
        "eth_sendTransaction",
        "personal_sign",
        "wallet_requestPermissions",
        "debug_traceTransaction",
        "eth_newFilter",
        "eth_uninstallFilter",
      ]) {
        assert.equal(isSafeRpcForwardingMethod(method), false, method);
        await assert.rejects(
          handleSafeRpcRequest(RPC_URL, method, []),
          /not allowed/i,
        );
      }
      assert.equal(fetchCalls, before);
    });

    await t.test("rejects unconfigured endpoints and malformed params", async () => {
      const before = fetchCalls;
      await assert.rejects(
        handleSafeRpcRequest(
          "https://attacker.example",
          "eth_blockNumber",
          [],
        ),
        /URL not in allowed list/i,
      );
      await assert.rejects(
        handleSafeRpcRequest(RPC_URL, "eth_blockNumber", {
          unexpected: true,
        }),
        /Invalid RPC request/i,
      );
      assert.equal(fetchCalls, before);
    });

    await t.test("rejects oversized request bodies before fetch", async () => {
      const before = fetchCalls;
      await assert.rejects(
        handleSafeRpcRequest(RPC_URL, "eth_call", ["x".repeat(524_288)]),
        /request is too large/i,
      );
      assert.equal(fetchCalls, before);
    });

    await t.test("rejects a declared oversized response before reading it", async () => {
      fetchHandler = async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-length": "8000001" },
        });
      await assert.rejects(
        handleSafeRpcRequest(RPC_URL, "eth_blockNumber", []),
        /response is too large/i,
      );
    });

    await t.test("cancels a chunked response that crosses the byte cap", async () => {
      fetchHandler = async () => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(8_000_001));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      };
      await assert.rejects(
        handleSafeRpcRequest(RPC_URL, "eth_blockNumber", []),
        /response is too large/i,
      );
    });

    await t.test("admits at most sixteen in-flight RPC requests", async () => {
      let releaseFetches!: () => void;
      const fetchGate = new Promise<void>((resolve) => {
        releaseFetches = resolve;
      });
      let started = 0;
      fetchHandler = async () => {
        started += 1;
        await fetchGate;
        return rpcResponse("0x10");
      };

      const pending = Array.from({ length: 16 }, () =>
        handleSafeRpcRequest(RPC_URL, "eth_blockNumber", []),
      );
      while (started < 16) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      await assert.rejects(
        handleSafeRpcRequest(RPC_URL, "eth_blockNumber", []),
        /too many concurrent/i,
      );

      releaseFetches();
      assert.deepEqual(await Promise.all(pending), Array(16).fill("0x10"));
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
