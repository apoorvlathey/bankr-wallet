import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const readChrome = (name: string) =>
  readFile(new URL(`../../src/chrome/${name}`, import.meta.url), "utf8");

test("avatar root facade preserves implementation export identities", async () => {
  const [facade, body, coordinator, policy, scheduler] = await Promise.all([
    import("../../src/chrome/avatarImageCache"),
    import("../../src/chrome/avatar/bodyReader"),
    import("../../src/chrome/avatar/coordinator"),
    import("../../src/chrome/avatar/policy"),
    import("../../src/chrome/avatar/scheduler"),
  ]);
  assert.equal(facade.readAvatarBlobBounded, body.readAvatarBlobBounded);
  assert.equal(facade.fetchAndCacheAvatarImage, coordinator.fetchAndCacheAvatarImage);
  assert.equal(facade.getCachedAvatarImage, coordinator.getCachedAvatarImage);
  assert.equal(facade.isAllowedAvatarUrl, policy.isAllowedAvatarUrl);
  assert.equal(
    facade.invalidateAvatarImageCacheForWalletReset,
    scheduler.invalidateAvatarImageCacheForWalletReset,
  );
});

test("avatar modules retain one-way trust and effect boundaries", async () => {
  const names = [
    "avatar/constants.ts",
    "avatar/types.ts",
    "avatar/policy.ts",
    "avatar/bodyReader.ts",
    "avatar/scheduler.ts",
    "avatar/transport.ts",
    "avatar/rasterizer.ts",
    "avatar/repository.ts",
    "avatar/coordinator.ts",
  ];
  const sources = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await readChrome(name)] as const)),
  );
  assert.doesNotMatch(sources["avatar/constants.ts"], /\bimport\b|chrome\.|fetch\(/);
  assert.doesNotMatch(sources["avatar/types.ts"], /\bimport\b|chrome\.|fetch\(/);
  assert.doesNotMatch(sources["avatar/policy.ts"], /chrome\.storage|fetch\(|OffscreenCanvas/);
  assert.doesNotMatch(sources["avatar/bodyReader.ts"], /chrome\.|fetch\(|OffscreenCanvas/);
  assert.doesNotMatch(sources["avatar/scheduler.ts"], /chrome\.|fetch\(|OffscreenCanvas/);
  assert.doesNotMatch(sources["avatar/transport.ts"], /chrome\.storage|OffscreenCanvas/);
  assert.doesNotMatch(sources["avatar/rasterizer.ts"], /chrome\.|fetch\(/);
  assert.doesNotMatch(sources["avatar/repository.ts"], /\bfetch\(|OffscreenCanvas|from ["']\.\/scheduler["']/);
  for (const source of Object.values(sources)) {
    assert.doesNotMatch(source, /from ["']\.\.\/avatarImageCache["']/);
  }
});

test("avatar facade and implementations remain audit-sized", async () => {
  const budgets: Record<string, number> = {
    "avatarImageCache.ts": 15,
    "avatar/constants.ts": 20,
    "avatar/types.ts": 12,
    "avatar/policy.ts": 40,
    "avatar/bodyReader.ts": 55,
    "avatar/scheduler.ts": 100,
    "avatar/transport.ts": 90,
    "avatar/rasterizer.ts": 90,
    "avatar/repository.ts": 150,
    "avatar/coordinator.ts": 75,
  };
  for (const [name, maximum] of Object.entries(budgets)) {
    const source = await readChrome(name);
    assert.ok(source.split("\n").length <= maximum, `${name} exceeds ${maximum} lines`);
  }
  const facade = await readChrome("avatarImageCache.ts");
  assert.match(facade, /compatibility facade/i);
  assert.doesNotMatch(facade, /\b(?:const|let|class|function)\b|chrome\.|fetch\(/);

  const roots = (await readdir(new URL("../../src/chrome/", import.meta.url)))
    .filter((name) => /^avatar.*\.ts$/i.test(name))
    .sort();
  assert.deepEqual(roots, ["avatarImageCache.ts"]);
  assert.match(await readChrome("avatar/README.md"), /Review in dependency order/);
});
