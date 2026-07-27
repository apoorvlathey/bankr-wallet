import assert from "node:assert/strict";
import test from "node:test";
import { SnapshotDetector, snapshotFromConfig } from "../src/detector.js";
import { SOURCE_URL } from "../src/sourceClient.js";
import { normalizeLookupHostname, parsePhishingConfig } from "../src/validation.js";

const fetchedAt = "2026-07-26T00:00:00.000Z";
const config = {
  version: 2 as const,
  tolerance: 1,
  whitelist: ["safe.blocked.example"],
  blacklist: ["blocked.example"],
  fuzzylist: ["metamask.io"],
};

test("uses MetaMask allowlist, blocklist, subdomain, and fuzzy precedence", () => {
  const detector = new SnapshotDetector(
    snapshotFromConfig(config, SOURCE_URL, fetchedAt),
    () => Date.parse(fetchedAt),
  );
  assert.equal(detector.check("blocked.example").outcome, "blocked");
  assert.equal(detector.check("sub.blocked.example").outcome, "blocked");
  assert.equal(detector.check("safe.blocked.example").outcome, "no_match");
  assert.deepEqual(detector.check("metamask.co"), {
    outcome: "suspicious",
    matchType: "fuzzylist",
    matchedHostname: "metamask.io",
    snapshot: { version: 2, fetchedAt, stale: false },
  });
  assert.equal(detector.check("ordinary.example").outcome, "no_match");
});

test("marks old snapshots stale without discarding known threats", () => {
  const detector = new SnapshotDetector(
    snapshotFromConfig(config, SOURCE_URL, fetchedAt),
    () => Date.parse(fetchedAt) + 60 * 60 * 1_000 + 1,
  );
  assert.deepEqual(detector.check("blocked.example").snapshot.stale, true);
  assert.equal(detector.check("blocked.example").outcome, "blocked");
});

test("custom allowlist trusts exact hosts and subdomains after threat checks", () => {
  const allowlist = [{
    hostname: "trusted.example",
    allowAllSubdomains: true,
  }];
  const trustedDetector = new SnapshotDetector(
    snapshotFromConfig(config, SOURCE_URL, fetchedAt),
    () => Date.parse(fetchedAt),
    allowlist,
  );
  assert.deepEqual(trustedDetector.check("app.trusted.example"), {
    outcome: "trusted",
    matchType: "allowlist",
    matchedHostname: "trusted.example",
    snapshot: { version: 2, fetchedAt, stale: false },
  });

  const blockedDetector = new SnapshotDetector(
    snapshotFromConfig(
      { ...config, blacklist: ["app.trusted.example"] },
      SOURCE_URL,
      fetchedAt,
    ),
    () => Date.parse(fetchedAt),
    allowlist,
  );
  assert.equal(blockedDetector.check("app.trusted.example").outcome, "blocked");
});

test("validates source schemas and hostname-only lookup input", () => {
  assert.deepEqual(parsePhishingConfig(config), config);
  assert.deepEqual(
    parsePhishingConfig({
      ...config,
      blacklist: ["blocked.example/path/to/phish"],
    })?.blacklist,
    ["blocked.example/path/to/phish"],
  );
  assert.equal(
    parsePhishingConfig({ ...config, blacklist: ["https://blocked.example"] }),
    null,
  );
  assert.equal(parsePhishingConfig({ ...config, version: 3 }), null);
  assert.equal(normalizeLookupHostname("EXAMPLE.com."), "example.com");
  assert.equal(normalizeLookupHostname("example.com:443"), null);
  assert.equal(normalizeLookupHostname("https://example.com"), null);
  assert.equal(normalizeLookupHostname("example.com/path"), null);
});
