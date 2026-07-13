import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GATEWAY_HOST,
  getEnsBrowsingSettings,
  isValidGatewayHost,
  setEnsBrowsingSetting,
} from "../../src/chrome/ensBrowsing/settingsStorage";
import {
  invalidateKuboGatewayProbe,
  probeKuboApi,
  probeKuboGateway,
} from "../../src/chrome/ensBrowsing/kubo";

test("ENS local-gateway egress validates hosts and rejects redirect pivots", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const originalFetch = globalThis.fetch;
  const local: Record<string, unknown> = {
    ensBrowsing: {
      enabled: true,
      useLocalGateway: true,
      gatewayHost: "localhost@tracking.example",
      gatewayPort: 8080,
    },
  };
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: local[key] };
          },
          async set(values: Record<string, unknown>) {
            Object.assign(local, structuredClone(values));
          },
        },
      },
    },
  });
  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });
    if (String(input).includes("/api/v0/version")) {
      return new Response(JSON.stringify({ Version: "0.30.0" }), {
        status: 200,
      });
    }
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(isValidGatewayHost("localhost"), true);
    assert.equal(isValidGatewayHost("my-kubo.example"), true);
    for (const value of [
      "localhost@tracking.example",
      "https://localhost",
      "localhost:8080",
      "../localhost",
      "bad..host",
    ]) {
      assert.equal(isValidGatewayHost(value), false, value);
    }

    assert.equal((await getEnsBrowsingSettings()).gatewayHost, DEFAULT_GATEWAY_HOST);
    await assert.rejects(
      setEnsBrowsingSetting("gatewayHost", "localhost@tracking.example"),
      /Invalid local gateway hostname/i,
    );

    invalidateKuboGatewayProbe();
    assert.equal(await probeKuboGateway({ force: true }), true);
    const gateway = requests.at(-1)!;
    assert.equal(gateway.init?.redirect, "manual");
    assert.equal(gateway.init?.credentials, "omit");
    assert.equal(gateway.init?.referrerPolicy, "no-referrer");

    assert.deepEqual(await probeKuboApi(), { ok: true, version: "0.30.0" });
    const api = requests.at(-1)!;
    assert.equal(api.init?.redirect, "error");
    assert.equal(api.init?.credentials, "omit");
    assert.equal(api.init?.referrerPolicy, "no-referrer");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
