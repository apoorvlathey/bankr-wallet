import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { privateKeyToAccount } from "viem/accounts";

const originalFetch = globalThis.fetch;
const signerAccount = privateKeyToAccount(`0x${"11".repeat(32)}`);
const otherAccount = privateKeyToAccount(`0x${"22".repeat(32)}`);
const signer = signerAccount.address;
const otherSigner = otherAccount.address;
const txHash = `0x${"cd".repeat(32)}`;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function signatureResponse(
  init: RequestInit | undefined,
  signingAccount = signerAccount,
  reportedSigner: string = signingAccount.address,
): Promise<Response> {
  const request = JSON.parse(String(init?.body)) as Record<string, any>;
  const signature =
    request.signatureType === "personal_sign"
      ? await signingAccount.signMessage({ message: request.message })
      : await signingAccount.signTypedData(request.typedData);
  return jsonResponse({
    success: true,
    signature,
    signer: reportedSigner,
    signatureType: request.signatureType,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const bankr = await import("../../src/chrome/bankrApi");
const bounded = await import("../../src/chrome/boundedHttpResponse");

test("Bankr signatures require a bounded valid response from the requested signer", async () => {
  globalThis.fetch = async (_input, init) => signatureResponse(init);
  const result = await bankr.signMessageViaApi(
    "secret-api-key",
    "personal_sign",
    ["0x6869", signer],
  );
  assert.match(result.signature, /^0x[0-9a-f]{130}$/i);
  assert.equal(result.signer, signer);

  globalThis.fetch = async (_input, init) =>
    signatureResponse(init, signerAccount, otherSigner);
  await assert.rejects(
    bankr.signMessageViaApi("secret-api-key", "personal_sign", ["0x", signer]),
    /does not match the reviewed account/i,
  );

  // A backend-provided signer field is not proof: recover from the exact
  // signed challenge and reject a signature made by another key.
  globalThis.fetch = async (_input, init) =>
    signatureResponse(init, otherAccount, signer);
  await assert.rejects(
    bankr.signMessageViaApi("secret-api-key", "personal_sign", ["0x", signer]),
    /signature does not belong to the reviewed account/i,
  );

  globalThis.fetch = async () =>
    jsonResponse({
      success: true,
      signature: "0x1234",
      signer,
      signatureType: "personal_sign",
    });
  await assert.rejects(
    bankr.signMessageViaApi("secret-api-key", "personal_sign", ["0x", signer]),
    /invalid signature/i,
  );

  globalThis.fetch = async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-length": String(300 * 1024) },
    });
  await assert.rejects(
    bankr.signMessageViaApi("secret-api-key", "personal_sign", ["0x", signer]),
    /oversized signature response/i,
  );

  globalThis.fetch = async () =>
    jsonResponse({ error: `denied\u0000${"x".repeat(2_000)}` }, 400);
  await assert.rejects(
    bankr.signMessageViaApi("secret-api-key", "personal_sign", ["0x", signer]),
    (error: unknown) =>
      error instanceof Error &&
      error.message.length <= 1_000 &&
      !error.message.includes("\u0000"),
  );
});

test("typed-data responses are cryptographically bound to the requested signer", async () => {
  const typedData = {
    domain: {
      name: "WalletChan test",
      version: "1",
      chainId: 1,
      verifyingContract: "0x0000000000000000000000000000000000000001",
    },
    types: {
      Message: [{ name: "contents", type: "string" }],
    },
    primaryType: "Message",
    message: { contents: "Review this exact payload" },
  } as const;
  globalThis.fetch = async (_input, init) => signatureResponse(init);
  const valid = await bankr.signMessageViaApi(
    "secret-api-key",
    "eth_signTypedData_v4",
    [signer, JSON.stringify(typedData)],
  );
  assert.equal(valid.signer, signer);

  globalThis.fetch = async (_input, init) =>
    signatureResponse(init, otherAccount, signer);
  await assert.rejects(
    bankr.signMessageViaApi(
      "secret-api-key",
      "eth_signTypedData_v4",
      [signer, JSON.stringify(typedData)],
    ),
    /signature does not belong to the reviewed account/i,
  );
});

test("Bankr submit verifies the remote signer before the irreversible request", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith("/wallet/sign")) {
      return signatureResponse(init);
    }
    return jsonResponse({
      success: true,
      transactionHash: txHash,
      status: "success",
      signer,
      chainId: 8453,
    });
  };

  let irreversibleStarted = false;
  const result = await bankr.submitTransactionDirect(
    "secret-api-key",
    {
      from: signer,
      to: otherSigner,
      value: "0x1",
      data: "0x",
      chainId: 8453,
    },
    undefined,
    () => {
      irreversibleStarted = true;
    },
  );
  assert.equal(result.transactionHash, txHash);
  assert.equal(irreversibleStarted, true);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /\/wallet\/sign$/);
  assert.match(requests[1].url, /\/wallet\/submit$/);
  assert.equal(requests[0].init?.redirect, "error");
  assert.equal(requests[1].init?.redirect, "error");
  const submitBody = JSON.parse(String(requests[1].init?.body));
  assert.equal("from" in submitBody.transaction, false);

  let calls = 0;
  irreversibleStarted = false;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    return signatureResponse(init, otherAccount, signer);
  };
  await assert.rejects(
    bankr.submitTransactionDirect(
      "secret-api-key",
      {
        from: signer,
        to: otherSigner,
        chainId: 8453,
      },
      undefined,
      () => {
        irreversibleStarted = true;
      },
    ),
    /signature does not belong to the reviewed account/i,
  );
  assert.equal(calls, 1, "submit must not run after signer verification fails");
  assert.equal(irreversibleStarted, false);
});

test("unprovable Bankr submit responses warn against retry", async () => {
  let call = 0;
  globalThis.fetch = async (_input, init) => {
    call += 1;
    if (call === 1) return signatureResponse(init);
    return jsonResponse({
      success: true,
      transactionHash: txHash,
      status: "success",
      signer: otherSigner,
      chainId: 8453,
    });
  };
  await assert.rejects(
    bankr.submitTransactionDirect("secret-api-key", {
      from: signer,
      to: otherSigner,
      chainId: 8453,
    }),
    /check activity before retrying/i,
  );
});

test("Bankr submit treats retryable HTTP errors as an ambiguous remote outcome", async () => {
  for (const status of [408, 409, 425, 429, 503]) {
    let call = 0;
    globalThis.fetch = async (_input, init) => {
      call += 1;
      if (call === 1) return signatureResponse(init);
      return jsonResponse({ error: "upstream unavailable" }, status);
    };
    await assert.rejects(
      bankr.submitTransactionDirect("secret-api-key", {
        from: signer,
        to: otherSigner,
        chainId: 8453,
      }),
      /outcome is unknown; check activity before retrying/i,
    );
  }
});

test("bounded HTTP consumption enforces deadlines and byte ceilings", async () => {
  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    })) as typeof fetch;
  await assert.rejects(
    bounded.fetchTextBounded("https://example.invalid", {}, {
      timeoutMs: 5,
      maxBytes: 32,
    }),
    (error: unknown) => error instanceof bounded.HttpRequestTimeoutError,
  );

  globalThis.fetch = async () => new Response("x".repeat(33));
  await assert.rejects(
    bounded.fetchTextBounded("https://example.invalid", {}, {
      timeoutMs: 1_000,
      maxBytes: 32,
    }),
    (error: unknown) => error instanceof bounded.HttpResponseTooLargeError,
  );
});

test("Bankr job lookup rejects path injection and malformed payloads", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse({ status: "completed", result: { txHash } });
  };
  await assert.rejects(
    bankr.getJobStatus("secret-api-key", "../wallet/sign"),
    /invalid Bankr job ID/i,
  );
  assert.equal(called, false);
  assert.equal(
    (await bankr.getJobStatus("secret-api-key", "safe_job-1")).result?.txHash,
    txHash,
  );

  globalThis.fetch = async () => jsonResponse({ status: "surprise" });
  await assert.rejects(
    bankr.getJobStatus("secret-api-key", "safe_job-2"),
    /invalid job status/i,
  );
});
