import assert from "node:assert/strict";
import test from "node:test";

import {
  bookmarkForDirectoryDapp,
  bookmarkForCachedDapp,
  bookmarkForConnectedDapp,
  connectedFavoriteOrigins,
  favoriteDappDisplayUrl,
  favoriteDappBrowserFaviconPageUrl,
  favoriteDappFaviconFallbackUrl,
  favoriteDappFaviconUrl,
  filterConnectedDapps,
  navigationUrlForTarget,
  parseDapp3Target,
} from "../../src/components/Dapp3Browser/dapp3BrowserModel";

const connected = [
  {
    origin: "https://app.uniswap.org",
    hostname: "app.uniswap.org",
    title: "Uniswap",
    lastConnectedAt: 20,
  },
  {
    origin: "https://launch.o1.exchange",
    hostname: "launch.o1.exchange",
    lastConnectedAt: 10,
  },
];

test("connected dapp search matches hostname, title, and origin", () => {
  assert.deepEqual(filterConnectedDapps(connected, "  UNI "), [connected[0]]);
  assert.deepEqual(filterConnectedDapps(connected, "o1.exchange"), [connected[1]]);
  assert.deepEqual(filterConnectedDapps(connected, "https://app"), [connected[0]]);
  assert.deepEqual(filterConnectedDapps(connected, "missing"), []);
  assert.equal(filterConnectedDapps(connected, ""), connected);
  assert.deepEqual(
    filterConnectedDapps(connected, "friendly.eth", () => "friendly.eth"),
    connected,
  );
});

test("connected favorites retain their safe launch origin independently", () => {
  const bookmark = bookmarkForConnectedDapp(connected[0], 123);
  assert.deepEqual(bookmark, {
    ensName: "app.uniswap.org",
    path: "/",
    launchUrl: "https://app.uniswap.org",
    title: "Uniswap",
    favicon: undefined,
    addedAt: 123,
  });
  assert.deepEqual(
    [...connectedFavoriteOrigins([bookmark])],
    ["https://app.uniswap.org"],
  );
});

test("recently cached dapps retain resolver metadata when favorited", () => {
  assert.deepEqual(
    bookmarkForCachedDapp(
      {
        ensName: "zrouter.eth",
        kind: "ipfs",
        value: "bafy-example",
        resolvedAt: 100,
        title: "zSwap",
        favicon: "https://zrouter.eth.limo/favicon.ico",
      },
      123,
    ),
    {
      ensName: "zrouter.eth",
      path: "/",
      kind: "ipfs",
      contractAddress: undefined,
      title: "zSwap",
      favicon: "https://zrouter.eth.limo/favicon.ico",
      addedAt: 123,
    },
  );
});

test("browser targets preserve resolver routing and admit safe HTTPS URLs", () => {
  assert.deepEqual(parseDapp3Target("vitalik.eth/profile"), {
    kind: "ens",
    host: "vitalik.eth",
    rest: "/profile",
  });
  assert.deepEqual(parseDapp3Target("https://vitalik.eth.limo/profile"), {
    kind: "ens",
    host: "vitalik.eth",
    rest: "/profile",
  });
  const httpsTarget = parseDapp3Target(
    "https://app.uniswap.org/swap?chain=base#trade",
  );
  assert.deepEqual(httpsTarget, {
    kind: "https",
    url: "https://app.uniswap.org/swap?chain=base#trade",
  });
  assert.equal(
    httpsTarget && navigationUrlForTarget(httpsTarget),
    "https://app.uniswap.org/swap?chain=base#trade",
  );
  assert.equal(parseDapp3Target("http://ordinary.example"), null);
  assert.equal(parseDapp3Target("https://user:pass@example.com"), null);
  assert.equal(parseDapp3Target("javascript:alert(1)"), null);
});

test("directory favorites retain safe origin identity without navigation", () => {
  assert.deepEqual(
    bookmarkForDirectoryDapp(
      {
        name: "Uniswap",
        url: "https://app.uniswap.org/swap?chain=base",
        logo: "https://icons.example/uniswap.png",
      },
      123,
    ),
    {
      ensName: "app.uniswap.org",
      path: "/",
      launchUrl: "https://app.uniswap.org",
      title: "Uniswap",
      favicon: "https://icons.example/uniswap.png",
      addedAt: 123,
    },
  );
  assert.equal(
    bookmarkForDirectoryDapp({
      name: "Unsafe",
      url: "https://user:secret@app.example/",
    }),
    null,
  );
});

test("favorite cards show hostnames and recover local gateway favicon paths", () => {
  const connectedBookmark = {
    ensName: "app.aave.com",
    path: "/",
    launchUrl: "https://app.aave.com",
    title: "Aave",
    addedAt: 1,
  };
  assert.equal(favoriteDappDisplayUrl(connectedBookmark), "app.aave.com");
  assert.match(
    favoriteDappFaviconUrl(connectedBookmark),
    /^https:\/\/t1\.gstatic\.com\/faviconV2\?/,
  );
  const ensBookmark = {
    ensName: "zrouter.eth",
    path: "/",
    kind: "ipfs" as const,
    favicon: "http://bafybeig.example.ipfs.localhost/assets/icon.png?v=2",
    addedAt: 2,
  };
  assert.equal(
    favoriteDappBrowserFaviconPageUrl(ensBookmark),
    "https://zrouter.eth.link/",
  );
  assert.equal(favoriteDappDisplayUrl(ensBookmark), "zrouter.eth");
  assert.equal(
    favoriteDappFaviconUrl(ensBookmark),
    "https://zrouter.eth.limo/assets/icon.png?v=2",
  );
  assert.match(
    favoriteDappFaviconFallbackUrl(ensBookmark),
    /url=https%3A%2F%2Fzrouter\.eth\.limo/,
  );

  assert.equal(
    favoriteDappFaviconUrl({
      ...ensBookmark,
      favicon: "http://127.0.0.1:8080/ipfs/bafybeig/assets/icon.png",
    }),
    "https://zrouter.eth.limo/assets/icon.png",
  );
});
