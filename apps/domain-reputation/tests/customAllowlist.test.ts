import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOM_DOMAIN_ALLOWLIST,
  findCustomAllowlistMatch,
  parseCustomAllowlist,
} from "../src/customAllowlist.js";

test("ships WalletChan and eth.sh with subdomain trust enabled", () => {
  assert.deepEqual(CUSTOM_DOMAIN_ALLOWLIST, [
    { hostname: "walletchan.com", allowAllSubdomains: true },
    { hostname: "eth.sh", allowAllSubdomains: true },
  ]);
});

test("parses exact and subdomain-enabled custom allowlist entries", () => {
  assert.deepEqual(
    parseCustomAllowlist([
      { hostname: "exact.example" },
      { hostname: "parent.example", allowAllSubdomains: true },
    ]),
    [
      { hostname: "exact.example", allowAllSubdomains: false },
      { hostname: "parent.example", allowAllSubdomains: true },
    ],
  );
});

test("matches exact hosts and only explicitly enabled subdomains", () => {
  const entries = parseCustomAllowlist([
    { hostname: "exact.example" },
    { hostname: "parent.example", allowAllSubdomains: true },
  ]);
  assert.equal(
    findCustomAllowlistMatch("exact.example", entries)?.hostname,
    "exact.example",
  );
  assert.equal(findCustomAllowlistMatch("app.exact.example", entries), null);
  assert.equal(
    findCustomAllowlistMatch("deep.app.parent.example", entries)?.hostname,
    "parent.example",
  );
  assert.equal(findCustomAllowlistMatch("notparent.example", entries), null);
});

test("rejects non-canonical and duplicate custom entries", () => {
  assert.throws(() => parseCustomAllowlist([{ hostname: "UPPER.example" }]));
  assert.throws(() =>
    parseCustomAllowlist([
      { hostname: "same.example" },
      { hostname: "same.example" },
    ])
  );
});
