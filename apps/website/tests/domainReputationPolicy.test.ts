import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeReputationHostname,
  parseMetaMaskDomainReputationResponse,
  parseReputationServiceBaseUrl,
} from "../app/api/domain-reputation/policy";

test("accepts hostname-only reputation inputs", () => {
  assert.equal(normalizeReputationHostname("APP.Example.com."), "app.example.com");
  assert.equal(normalizeReputationHostname("https://app.example.com"), null);
  assert.equal(normalizeReputationHostname("app.example.com:443"), null);
  assert.equal(normalizeReputationHostname("app.example.com/path"), null);
});

test("accepts only a fixed HTTPS service base", () => {
  assert.equal(
    parseReputationServiceBaseUrl("https://reputation.example")?.href,
    "https://reputation.example/",
  );
  assert.equal(parseReputationServiceBaseUrl("http://reputation.example"), null);
  assert.equal(
    parseReputationServiceBaseUrl("https://reputation.example/hidden"),
    null,
  );
});

test("validates the bounded Railway response projection", () => {
  const response = {
    outcome: "blocked",
    matchType: "blocklist",
    matchedHostname: "bad.example",
    snapshot: {
      version: 2,
      fetchedAt: "2026-07-26T00:00:00.000Z",
      stale: false,
    },
  };
  assert.deepEqual(parseMetaMaskDomainReputationResponse(response), response);
  const trusted = {
    ...response,
    outcome: "trusted",
    matchType: "allowlist",
    matchedHostname: "walletchan.com",
  };
  assert.deepEqual(parseMetaMaskDomainReputationResponse(trusted), trusted);
  assert.equal(parseMetaMaskDomainReputationResponse({
    ...trusted,
    matchType: "none",
  }), null);
  assert.equal(parseMetaMaskDomainReputationResponse({
    ...trusted,
    matchedHostname: undefined,
  }), null);
  assert.equal(parseMetaMaskDomainReputationResponse({
    ...response,
    outcome: "unknown",
  }), null);
});
