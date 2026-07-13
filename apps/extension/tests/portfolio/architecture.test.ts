import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const movedRootFiles = new Set([
  "portfolioApi.ts",
  "portfolioHoldingsCache.ts",
  "portfolioSnapshotRefresh.ts",
  "portfolioSnapshotStorage.ts",
  "portfolioTokens.ts",
  "hiddenPortfolioTokens.ts",
  "recentlyReceivedTokens.ts",
  "onchainBalances.ts",
  "coingeckoService.ts",
]);

const readPortfolioModule = (name: string) =>
  readFile(
    new URL(`../../src/chrome/portfolio/${name}`, import.meta.url),
    "utf8",
  );

test("portfolio implementation has one audit folder and no root family", async () => {
  const rootEntries = await readdir(
    new URL("../../src/chrome/", import.meta.url),
    { withFileTypes: true },
  );
  assert.deepEqual(
    rootEntries
      .filter((entry) => entry.isFile() && movedRootFiles.has(entry.name))
      .map((entry) => entry.name),
    [],
  );

  const domainEntries = await readdir(
    new URL("../../src/chrome/portfolio/", import.meta.url),
    { withFileTypes: true },
  );
  for (const entry of domainEntries.filter(
    (candidate) => candidate.isFile() && candidate.name.endsWith(".ts"),
  )) {
    const source = await readPortfolioModule(entry.name);
    assert.ok(
      source.split(/\r?\n/).length <= 400,
      `${entry.name} exceeds the portfolio audit ceiling`,
    );
  }
});

test("portfolio pure policy and cache state stay separate from network effects", async () => {
  const [transforms, nativePolicy, state] = await Promise.all([
    readPortfolioModule("catalogTransforms.ts"),
    readPortfolioModule("coingeckoNativePolicy.ts"),
    readPortfolioModule("coingeckoState.ts"),
  ]);

  for (const source of [transforms, nativePolicy]) {
    assert.doesNotMatch(source, /chrome\.(?:storage|runtime)/);
    assert.doesNotMatch(source, /fetchJsonBounded|fetchTextBounded/);
  }
  assert.doesNotMatch(state, /fetchJsonBounded|fetchTextBounded/);
  assert.doesNotMatch(state, /constants\/externalUrls/);
});

test("portfolio composition preserves catalog, onchain, and snapshot direction", async () => {
  const [catalog, refresh, dataComposition, providerComposition] = await Promise.all([
    readPortfolioModule("tokenCatalog.ts"),
    readPortfolioModule("snapshotRefresh.ts"),
    readFile(
      new URL("../../src/chrome/background/composition/dataRoutes.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/chrome/background/composition/providerRoutes.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(catalog, /from ["'].\/catalogEnrichment["']/);
  assert.match(catalog, /from ["'].\/catalogTransforms["']/);
  assert.match(catalog, /from ["'].\/catalogTypes["']/);

  const catalogLoad = refresh.indexOf("loadPortfolioTokenCatalog(address)");
  const onchainRefresh = refresh.indexOf("fetchOnchainBalances(address");
  const snapshotWrite = refresh.indexOf("recordSnapshot(address");
  assert.ok(catalogLoad >= 0 && catalogLoad < onchainRefresh);
  assert.ok(onchainRefresh < snapshotWrite);

  assert.match(dataComposition, /from ["']\.\.\/\.\.\/portfolio\/coingecko["']/);
  assert.match(providerComposition, /from ["']\.\.\/\.\.\/portfolio\/hiddenTokens["']/);
  assert.doesNotMatch(dataComposition + providerComposition, /from ["'][^"']*(?:coingeckoService|hiddenPortfolioTokens)["']/);
});

test("portfolio cache keys, TTLs, and price fallback ordering stay compatible", async () => {
  const [state, native, erc20, direct, facade] = await Promise.all([
    readPortfolioModule("coingeckoState.ts"),
    readPortfolioModule("coingeckoNative.ts"),
    readPortfolioModule("coingeckoErc20.ts"),
    readPortfolioModule("directTokenPricing.ts"),
    readPortfolioModule("coingecko.ts"),
  ]);

  for (const key of [
    "coingeckoMarketCache",
    "coingeckoSearchCache",
    "coingeckoNativeResolutionCache",
    "coingeckoErc20PriceCache",
  ]) {
    assert.match(state, new RegExp(`"${key}"`));
  }
  assert.match(native, /MARKET_CACHE_TTL = 5 \* 60_000/);
  assert.match(native, /SEARCH_CACHE_TTL = 24 \* 60 \* 60_000/);
  assert.match(native, /RESOLUTION_CACHE_TTL = 7 \* 24 \* 60 \* 60_000/);
  assert.match(erc20, /ERC20_PRICE_CACHE_TTL = 5 \* 60_000/);

  assert.ok(
    erc20.indexOf("GECKOTERMINAL_TOKEN_PRICE_API}/${gtNetwork}") <
      erc20.indexOf("COINGECKO_TOKEN_PRICE_API}/${platformId}"),
  );
  assert.ok(
    direct.indexOf("COINGECKO_TOKEN_PRICE_API}/${platformId}") <
      direct.indexOf("GECKOTERMINAL_TOKEN_PRICE_API}/${gtNetwork}"),
  );
  assert.equal((facade.match(/new CoinGeckoState\(\)/g) ?? []).length, 1);
  assert.match(facade, /new CoinGeckoNativeService\(state\)/);
  assert.match(facade, /new CoinGeckoErc20Service\(state\)/);
});
