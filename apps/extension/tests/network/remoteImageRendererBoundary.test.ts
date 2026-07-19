import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const COMPONENT_ROOT = new URL("../../src/components/", import.meta.url);
const PAGE_ROOT = new URL("../../src/pages/", import.meta.url);

async function component(path: string): Promise<string> {
  return readFile(new URL(path, COMPONENT_ROOT), "utf8");
}

test("arbitrary decoded strings cannot fetch or render SVG in the wallet UI", async () => {
  const source = await component("decodedParams/StringParam.tsx");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /data:image\/svg\+xml/i);
  assert.match(source, /<SafeImage/);
});

test("NFT metadata cannot create raw iframe subresource requests", async () => {
  const source = await component("AssetChanges/NftMedia.tsx");
  assert.doesNotMatch(source, /\bsrcDoc\s*=/);
  assert.doesNotMatch(source, /as=["']iframe["']/);
  assert.match(source, /<SafeImage[\s\S]*src=\{src\}/);
});

test("token logos show the shared fallback while remote rasterization is pending", async () => {
  const sharedLogo = await component("TokenLogo.tsx");
  const requestLogo = await component("AssetChanges/TokenIcon.tsx");

  assert.match(sharedLogo, /import SafeImage from/);
  assert.match(sharedLogo, /<SafeImage[\s\S]*fallback=\{placeholder\}/);
  assert.match(requestLogo, /import TokenLogo from/);
  assert.match(requestLogo, /<TokenLogo/);
});

test("wallet resets cannot rehydrate identity imagery from DOM localStorage", async () => {
  const source = await readFile(
    new URL("../../src/lib/avatarCacheClient.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /localStorage\.getItem/);
  assert.doesNotMatch(source, /localStorage\.setItem/);
  assert.match(source, /localStorage\.removeItem\(LOCALSTORAGE_MIRROR_KEY\)/);
  assert.match(source, /validatedCachedRaster\(response\?\.dataUrl\)/);

  const portfolioSource = await readFile(
    new URL("../../src/chrome/portfolio/holdingsCache.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(portfolioSource, /localStorage\.getItem/);
  assert.doesNotMatch(portfolioSource, /localStorage\.setItem/);
  assert.match(portfolioSource, /clearPortfolioHoldingsLocalMirror\(\);/);
});

test("hostile dapp, WalletConnect, permission, and history images use the safe primitive", async () => {
  const cases: Array<[string, RegExp]> = [
    ["WalletConnectSessionsList.tsx", /src=\{session\.icons\[0\]\}/],
    ["WalletConnectProposalNotice.tsx", /src=\{icon\}/],
    ["PendingRequestRow.tsx", /src=\{src\}/],
    [
      "RequestConfirmation/RequestIdentity.tsx",
      /src=\{displayFavicon \|\| undefined\}/,
    ],
    ["WatchAssetConfirmation/WatchAssetConfirmationScreen.tsx", /src=\{imageUrl\}/],
    ["Activity/ActivityMedia.tsx", /src=\{imageSrc\}/],
    ["BatchCallsList.tsx", /src=\{favicon \|\| undefined\}/],
    ["ChainIcon.tsx", /src=\{meta\.iconSrc\}/],
    ["Swap/BridgeChainTokenPickerScreen.tsx", /src=\{iconUrl\}/],
    ["Swap/SwapQuoteSection.tsx", /src=\{destNativeInfo\.logoUrl\}/],
    ["Swap/SwapTokenControls.tsx", /src=\{token\.logoUrl\}/],
  ];

  for (const [path, sourcePattern] of cases) {
    const source = await component(path);
    assert.match(source, /import SafeImage from/);
    const assignment = source.match(sourcePattern);
    assert.ok(assignment, `${path}: expected hostile source assignment`);
    const before = source.slice(0, assignment.index).slice(-220);
    assert.match(before, /<SafeImage[\s\S]*$/, `${path}: raw image assignment`);
  }

  const browser = await readFile(new URL("Dapp3Browser.tsx", PAGE_ROOT), "utf8");
  const browserIcon = await component("Dapp3Browser/Dapp3SiteIcon.tsx");
  const suggestions = await component("Dapp3Browser/DappDirectorySuggestions.tsx");
  assert.match(browser, /import Dapp3SiteCard from/);
  assert.match(suggestions, /import Dapp3SiteIcon from/);
  assert.match(
    browserIcon,
    /const safeSrc = useCachedAvatarSrc\(src, "ens-cache-browser-image"\)/,
  );
  assert.doesNotMatch(browser, /<img[\s\S]{0,160}src=\{faviconSrc\}/);
});
