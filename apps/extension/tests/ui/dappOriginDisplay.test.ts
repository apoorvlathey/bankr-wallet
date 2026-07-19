import assert from "node:assert/strict";
import test from "node:test";
import { getDappOriginDisplay } from "../../src/lib/dappOriginDisplay";

const cachedSites = [
  {
    ensName: "zrouter.eth",
    kind: "ipfs" as const,
    value: "bafy-zrouter",
    resolvedAt: 3,
    favicon: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
  },
  {
    ensName: "apoorv.gwei",
    kind: "ipns" as const,
    value: "k51.example-name",
    resolvedAt: 2,
  },
  {
    ensName: "0x0000000000000000000000000000000000001234",
    kind: "web3" as const,
    value: "bafy-onchain",
    resolvedAt: 1,
  },
];

const gateway = { host: "gateway.home", port: 9080 };

test("maps configured IPFS, IPNS, and pinned onchain gateway origins", () => {
  const zrouter = getDappOriginDisplay(
    "http://bafy-zrouter.ipfs.gateway.home:9080",
    cachedSites,
    gateway,
  );
  assert.equal(zrouter.label, "zrouter.eth");
  assert.equal(zrouter.isEnsIpfsGateway, true);
  assert.equal(zrouter.faviconSrc, "https://zrouter.eth.limo/favicon.ico");
  assert.equal(
    zrouter.browserFaviconPageUrl,
    "http://bafy-zrouter.ipfs.gateway.home:9080",
  );
  assert.match(zrouter.faviconFallbackSrc || "", /zrouter\.eth\.limo/);
  assert.equal(
    getDappOriginDisplay(
      "http://k51-example--name.ipns.gateway.home:9080",
      cachedSites,
      gateway,
    ).label,
    "apoorv.gwei",
  );
  assert.equal(
    getDappOriginDisplay(
      "http://bafy-onchain.ipfs.gateway.home:9080",
      cachedSites,
      gateway,
    ).label,
    "0x0000000000000000000000000000000000001234",
  );
  assert.equal(
    getDappOriginDisplay(
      "http://bafy-onchain.ipfs.gateway.home:9080",
      cachedSites,
      gateway,
    ).isEnsIpfsGateway,
    false,
  );
});

test("maps exact eth.limo and eth.link origins to their ENS identity", () => {
  for (const origin of [
    "https://ens.eth.limo",
    "https://subdomain.ens.eth.link",
  ]) {
    const display = getDappOriginDisplay(origin, cachedSites, gateway);
    assert.equal(display.isEnsIpfsGateway, true);
    assert.equal(
      display.resolvedName,
      origin.includes("subdomain") ? "subdomain.ens.eth" : "ens.eth",
    );
    assert.equal(display.label, display.resolvedName);
  }
  assert.equal(
    getDappOriginDisplay(
      "https://ens.eth.limo.attacker.example",
      cachedSites,
      gateway,
    ).isEnsIpfsGateway,
    false,
  );
});

test("does not rewrite lookalike hosts or a different configured port", () => {
  assert.equal(
    getDappOriginDisplay(
      "http://bafy-zrouter.ipfs.gateway.home.attacker:9080",
      cachedSites,
      gateway,
    ).label,
    "bafy-zrouter.ipfs.gateway.home.attacker",
  );
  assert.equal(
    getDappOriginDisplay(
      "http://bafy-zrouter.ipfs.gateway.home:8080",
      cachedSites,
      gateway,
    ).label,
    "bafy-zrouter.ipfs.gateway.home",
  );
  assert.equal(
    getDappOriginDisplay(
      "https://bafy-zrouter.ipfs.gateway.home:9080",
      cachedSites,
      gateway,
    ).label,
    "bafy-zrouter.ipfs.gateway.home",
  );
});

test("leaves ordinary and internal origins unchanged for display", () => {
  assert.equal(
    getDappOriginDisplay("https://app.aave.com", cachedSites, gateway).label,
    "app.aave.com",
  );
  assert.equal(
    getDappOriginDisplay("WalletChan", cachedSites, gateway).label,
    "WalletChan",
  );
});
