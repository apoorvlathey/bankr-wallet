import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { POST } from "../app/api/gas/pimlico/[chainId]/route";

const GAS_PRICE_REQUEST = {
  jsonrpc: "2.0",
  id: 1,
  method: "pimlico_getUserOperationGasPrice",
  params: [],
};

function request(body: unknown): NextRequest {
  return new NextRequest("https://walletchan.com/api/gas/pimlico/8453", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `route-test-${Math.random()}`,
    },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  return POST(request(body), { params: Promise.resolve({ chainId: "8453" }) });
}

test("fails closed when the Pimlico proxy is disabled or unconfigured", async () => {
  const priorDisabled = process.env.PIMLICO_PROXY_DISABLED;
  const priorKey = process.env.PIMLICO_API_KEY;
  try {
    process.env.PIMLICO_PROXY_DISABLED = "true";
    process.env.PIMLICO_API_KEY = "server-secret";
    assert.equal((await post(GAS_PRICE_REQUEST)).status, 503);

    delete process.env.PIMLICO_PROXY_DISABLED;
    delete process.env.PIMLICO_API_KEY;
    assert.equal((await post(GAS_PRICE_REQUEST)).status, 503);
  } finally {
    if (priorDisabled === undefined) delete process.env.PIMLICO_PROXY_DISABLED;
    else process.env.PIMLICO_PROXY_DISABLED = priorDisabled;
    if (priorKey === undefined) delete process.env.PIMLICO_API_KEY;
    else process.env.PIMLICO_API_KEY = priorKey;
  }
});

test("rejects a method outside the explicit proxy allowlist", async () => {
  const priorKey = process.env.PIMLICO_API_KEY;
  try {
    process.env.PIMLICO_API_KEY = "server-secret";
    const response = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [],
    });
    assert.equal(response.status, 400);
  } finally {
    if (priorKey === undefined) delete process.env.PIMLICO_API_KEY;
    else process.env.PIMLICO_API_KEY = priorKey;
  }
});

test("forwards only to Pimlico's fixed chain endpoint with the server key", async () => {
  const priorKey = process.env.PIMLICO_API_KEY;
  const priorFetch = globalThis.fetch;
  let observedUrl = "";
  let observedBody = "";
  try {
    process.env.PIMLICO_API_KEY = "server secret";
    globalThis.fetch = async (input, init) => {
      observedUrl = String(input);
      observedBody = String(init?.body);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const response = await post(GAS_PRICE_REQUEST);
    assert.equal(response.status, 200);
    assert.equal(
      observedUrl,
      "https://api.pimlico.io/v2/8453/rpc?apikey=server%20secret",
    );
    assert.deepEqual(JSON.parse(observedBody), GAS_PRICE_REQUEST);
    assert.equal((await response.text()).includes("server secret"), false);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.PIMLICO_API_KEY;
    else process.env.PIMLICO_API_KEY = priorKey;
  }
});
