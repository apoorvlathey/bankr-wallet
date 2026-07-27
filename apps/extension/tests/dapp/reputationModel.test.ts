import assert from "node:assert/strict";
import test from "node:test";
import {
  combineDappReputation,
  exactDirectoryMatch,
  parseMetaMaskReputationResult,
} from "../../src/chrome/dapp/reputationModel";

const freshNoMatch = {
  outcome: "no_match" as const,
  matchType: "none" as const,
  snapshot: {
    version: 2,
    fetchedAt: "2026-07-26T00:00:00.000Z",
    stale: false,
  },
};
const directory = [{
  name: "Example",
  url: "https://www.example.com/",
  hostname: "www.example.com",
}];

test("MetaMask block and fuzzy results always outrank directory recognition", () => {
  assert.equal(
    combineDappReputation("example.com", {
      ...freshNoMatch,
      outcome: "blocked",
      matchType: "blocklist",
    }, directory).status,
    "danger",
  );
  assert.deepEqual(
    combineDappReputation("example.com", {
      ...freshNoMatch,
      outcome: "suspicious",
      matchType: "fuzzylist",
      matchedHostname: "example.org",
    }, directory),
    {
      status: "suspicious",
      source: "metamask",
      matchedHostname: "example.org",
    },
  );
});

test("DeFiLlama recognition requires an exact hostname after www normalization", () => {
  assert.equal(exactDirectoryMatch("example.com", directory)?.name, "Example");
  assert.equal(exactDirectoryMatch("app.example.com", directory), null);
  assert.deepEqual(
    combineDappReputation("example.com", freshNoMatch, directory),
    { status: "recognized", source: "defillama", name: "Example" },
  );
});

test("WalletChan custom allowlist recognition is green before directory lookup", () => {
  assert.deepEqual(
    combineDappReputation("app.walletchan.com", {
      ...freshNoMatch,
      outcome: "trusted",
      matchType: "allowlist",
      matchedHostname: "walletchan.com",
    }, null),
    { status: "recognized", source: "walletchan" },
  );
});

test("exact directory recognition survives stale or unavailable negative checks", () => {
  assert.deepEqual(
    combineDappReputation(
      "example.com",
      {
        ...freshNoMatch,
        snapshot: { ...freshNoMatch.snapshot, stale: true },
      },
      directory,
    ),
    { status: "recognized", source: "defillama", name: "Example" },
  );
  assert.deepEqual(
    combineDappReputation("example.com", null, directory),
    { status: "recognized", source: "defillama", name: "Example" },
  );
});

test("negative-check availability matters only when the directory has no match", () => {
  assert.deepEqual(
    combineDappReputation("unknown.example", null, directory),
    { status: "unverified", reason: "check-unavailable" },
  );
  assert.deepEqual(
    combineDappReputation("unknown.example", freshNoMatch, directory),
    { status: "unverified", reason: "not-listed" },
  );
});

test("rejects malformed first-party response shapes", () => {
  assert.deepEqual(parseMetaMaskReputationResult(freshNoMatch), freshNoMatch);
  const trusted = {
    ...freshNoMatch,
    outcome: "trusted" as const,
    matchType: "allowlist" as const,
    matchedHostname: "walletchan.com",
  };
  assert.deepEqual(
    parseMetaMaskReputationResult(trusted),
    trusted,
  );
  assert.equal(parseMetaMaskReputationResult({
    ...trusted,
    matchType: "none",
  }), null);
  assert.equal(parseMetaMaskReputationResult({
    ...trusted,
    matchedHostname: undefined,
  }), null);
  assert.equal(parseMetaMaskReputationResult({
    ...freshNoMatch,
    outcome: "unknown",
  }), null);
});
