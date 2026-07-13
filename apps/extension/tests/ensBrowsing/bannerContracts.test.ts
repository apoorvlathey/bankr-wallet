import assert from "node:assert/strict";
import test from "node:test";

import {
  currentPagePath,
  parseEnsAddressInput,
  safeFaviconUrl,
  splitEnsDisplayUrl,
} from "../../src/chrome/ensBrowsing/banner/pageState";
import { buildHostedGatewayUrl } from "../../src/chrome/ensBrowsing/banner/menuActions";
import type { BannerTabContext } from "../../src/chrome/ensBrowsing/banner/types";

function context(
  overrides: Partial<BannerTabContext> = {},
): BannerTabContext {
  return {
    ensName: "site.eth",
    kind: "ipfs",
    value: "bafy",
    path: "/",
    trustedDirectly: false,
    ...overrides,
  };
}

test("banner input parser preserves the restricted ENS, GNS, and ERC-4804 routes", () => {
  assert.equal(parseEnsAddressInput("site.eth"), "http://site.eth/");
  assert.equal(
    parseEnsAddressInput("https://Sub.Site.ETH/path?q=1#part"),
    "http://sub.site.eth/path?q=1#part",
  );
  assert.equal(
    parseEnsAddressInput("name.gwei?tab=1"),
    "http://name.gwei?tab=1",
  );
  const address = `0x${"aB".repeat(20)}`;
  assert.equal(
    parseEnsAddressInput(`${address}/app`),
    `https://${address.toLowerCase()}.w3eth.io/app`,
  );
  for (const value of [
    "",
    "eth",
    "site.example",
    "javascript:alert(1)",
    "site.eth.evil.example",
    "site.eth:443/path",
    "user@site.eth/path",
    "site_eth",
  ]) {
    assert.equal(parseEnsAddressInput(value), null, value);
  }
});

test("banner metadata only accepts the historical favicon URL schemes", () => {
  assert.equal(safeFaviconUrl("https://site.example/icon.png"), "https://site.example/icon.png");
  assert.equal(safeFaviconUrl("http://site.example/icon.png"), "http://site.example/icon.png");
  assert.equal(safeFaviconUrl("data:image/png;base64,AA=="), "data:image/png;base64,AA==");
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "blob:https://site.example/id",
    "chrome-extension://id/icon.png",
  ]) {
    assert.equal(safeFaviconUrl(value), undefined, value);
  }
});

test("banner path and display splitting retain omnibox semantics", () => {
  const fakeLocation = {
    pathname: "/swap",
    search: "?from=eth",
    hash: "#review",
  } as Location;
  assert.equal(currentPagePath(fakeLocation), "/swap?from=eth#review");
  assert.equal(
    currentPagePath({ pathname: "/", search: "", hash: "" } as Location),
    "",
  );
  assert.deepEqual(splitEnsDisplayUrl("site.eth/swap"), {
    host: "site.eth",
    path: "/swap",
  });
});

test("hosted gateway targets preserve ENS, GNS, and ERC-4804 semantics", () => {
  assert.equal(
    buildHostedGatewayUrl(context(), "/docs?q=1#top"),
    "https://site.eth.limo/docs?q=1#top",
  );
  assert.equal(
    buildHostedGatewayUrl(context({ ensName: "site.gwei", kind: "ipns" }), ""),
    "https://site.gwei.domains/",
  );
  const contractAddress = `0x${"12".repeat(20)}` as `0x${string}`;
  assert.equal(
    buildHostedGatewayUrl(
      context({
        ensName: contractAddress,
        kind: "web3",
        contractAddress,
      }),
      "app",
    ),
    `https://${contractAddress}.w3eth.io/app`,
  );
});
