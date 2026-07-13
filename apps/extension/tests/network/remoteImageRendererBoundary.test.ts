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
  const source = await component("AssetChangesDisplay.tsx");
  assert.doesNotMatch(source, /\bsrcDoc\s*=/);
  assert.doesNotMatch(source, /as=["']iframe["']/);
  assert.match(source, /<SafeImage[\s\S]*src=\{src\}/);
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
    new URL("../../src/chrome/portfolioHoldingsCache.ts", import.meta.url),
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
    ["Erc7715PermissionReview.tsx", /src=\{permissionRequest\.favicon\}/],
    ["WatchAssetConfirmation/WatchAssetConfirmationScreen.tsx", /src=\{imageUrl\}/],
    ["SiweMessageDisplay.tsx", /src=\{faviconUrl\}/],
    ["TxStatusList.tsx", /src=\{imageSrc\}/],
    ["TransactionConfirmation.tsx", /src=\{favicon \|\| undefined\}/],
    ["BatchCallsList.tsx", /src=\{favicon \|\| undefined\}/],
    ["ChainIcon.tsx", /src=\{meta\.iconSrc\}/],
    ["Swap/BridgeChainTokenPickerScreen.tsx", /src=\{iconUrl\}/],
    ["Swap/SwapView.tsx", /src=\{destNativeInfo\.logoUrl\}/],
    ["Swap/SwapView.tsx", /src=\{token\.logoUrl\}/],
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
  assert.match(browser, /const safeSrc = useCachedAvatarSrc\(src\)/);
  assert.doesNotMatch(browser, /<img[\s\S]{0,160}src=\{faviconSrc\}/);
});
