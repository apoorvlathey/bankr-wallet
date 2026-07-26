import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { SnapshotDetector, snapshotFromConfig } from "../src/detector.js";
import { SOURCE_URL } from "../src/sourceClient.js";

const token = "a".repeat(32);
const detector = new SnapshotDetector(
  snapshotFromConfig(
    {
      version: 2,
      tolerance: 1,
      whitelist: [],
      blacklist: ["blocked.example"],
      fuzzylist: ["metamask.io"],
    },
    SOURCE_URL,
    new Date().toISOString(),
  ),
);

function app(loaded = true) {
  return createApp({ detector: loaded ? detector : null } as any, token);
}

test("health and readiness distinguish process life from snapshot availability", async () => {
  assert.equal((await app(false).request("/healthz")).status, 200);
  assert.equal((await app(false).request("/readyz")).status, 503);
  assert.equal((await app(true).request("/readyz")).status, 200);
});

test("lookup requires authentication and a hostname-only body", async () => {
  assert.equal(
    (await app().request("/v1/domain/check", { method: "POST" })).status,
    401,
  );
  const invalid = await app().request("/v1/domain/check", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ hostname: "https://blocked.example" }),
  });
  assert.equal(invalid.status, 400);
});

test("lookup stops reading a chunked body at the byte ceiling", async () => {
  const oversized = await app().request("/v1/domain/check", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ hostname: "a".repeat(REQUEST_OVERFLOW_BYTES) }),
  });
  assert.equal(oversized.status, 413);
});

test("lookup returns a bounded detector projection", async () => {
  const response = await app().request("/v1/domain/check", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ hostname: "blocked.example" }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.outcome, "blocked");
  assert.equal(payload.matchType, "blocklist");
  assert.deepEqual(Object.keys(payload).sort(), [
    "matchType",
    "matchedHostname",
    "outcome",
    "snapshot",
  ]);
});

const REQUEST_OVERFLOW_BYTES = 2_048;
