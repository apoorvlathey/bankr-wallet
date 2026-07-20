import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  discoverSafesByOwner,
  publishSafeConfirmation,
} from "../../src/chrome/safe/serviceClient";
import { clearSafeServiceRegistryCacheForTests } from "../../src/chrome/safe/serviceRegistry";

const owner = "0xb06a64615842cba9b3bdb7e6f726f3a5bd20dac2" as const;
const safe = "0xC970484D029D1D3f757847f4D4c804781Fa0bBc4";

beforeEach(() => clearSafeServiceRegistryCacheForTests());

function configResponse() {
  return Response.json({
    results: [{
      chainId: "84532",
      chainName: "Base Sepolia",
      shortName: "basesep",
      transactionService: "https://api.safe.global/tx-service/basesep",
      publicRpcUri: { authentication: "NO_AUTHENTICATION", value: "https://sepolia.base.org" },
      isTestnet: true,
    }],
  });
}

test("owner discovery goes directly to Safe with a checksum address", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("safe-config.safe.global")) return configResponse();
    return Response.json({ safes: [safe] });
  }) as typeof fetch;

  try {
    const result = await discoverSafesByOwner(84532, owner);
    assert.deepEqual(result, { safes: [safe] });
    assert.equal(urls.length, 2);
    assert.equal(
      urls[1],
      "https://api.safe.global/tx-service/basesep/api/v1/owners/0xb06a64615842CbA9b3Bdb7e6F726F3a5BD20daC2/safes/",
    );
    assert.doesNotMatch(urls[1], /walletchan/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirmations are written directly to Safe and accept an empty success response", async () => {
  const originalFetch = globalThis.fetch;
  let request: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes("safe-config.safe.global")) return configResponse();
    request = { url: String(input), init };
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    await publishSafeConfirmation({
      chainId: 84532,
      safeTxHash: `0x${"12".repeat(32)}`,
    } as Parameters<typeof publishSafeConfirmation>[0], {
      signature: `0x${"34".repeat(65)}`,
    } as Parameters<typeof publishSafeConfirmation>[1]);

    assert.equal(
      request?.url,
      `https://api.safe.global/tx-service/basesep/api/v1/multisig-transactions/0x${"12".repeat(32)}/confirmations/`,
    );
    assert.equal(request?.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      signature: `0x${"34".repeat(65)}`,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
