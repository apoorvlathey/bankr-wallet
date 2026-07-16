import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { Account } from "../../src/chrome/types";
import { getAddressIdentityPresentation } from "../../src/components/shared/addressIdentityPresentation";

const walletAccount: Account = {
  id: "account-1",
  type: "privateKey",
  address: "0x1111111111111111111111111111111111111111",
  displayName: "Treasury",
  createdAt: 1,
};

test("wallet display names take priority over resolved and fallback labels when no contact exists", () => {
  assert.deepEqual(
    getAddressIdentityPresentation({
      account: walletAccount,
      fallbackLabel: "0x1111...1111",
      resolvedAvatar: "https://example.com/avatar.png",
      resolvedName: "treasury.gwei",
    }),
    { avatarKind: "resolved", label: "Treasury" },
  );
});

test("cached names identify external addresses without fabricating avatars", () => {
  assert.deepEqual(
    getAddressIdentityPresentation({
      account: null,
      fallbackLabel: "Router",
      resolvedAvatar: null,
      resolvedName: "router.eth",
    }),
    { avatarKind: "none", label: "router.eth" },
  );
});

test("contact labels override wallet and public names without replacing resolved avatars", () => {
  assert.deepEqual(
    getAddressIdentityPresentation({
      account: null,
      contactLabel: "John",
      fallbackLabel: "Router",
      resolvedAvatar: null,
      resolvedName: "john.eth",
    }).label,
    "John",
  );
  assert.deepEqual(
    getAddressIdentityPresentation({
      account: walletAccount,
      contactLabel: "John",
      fallbackLabel: "Router",
      resolvedAvatar: "https://example.com/avatar.png",
      resolvedName: "john.eth",
    }),
    { avatarKind: "resolved", label: "John" },
  );
});

test("avatar fallback is reserved for addresses in the wallet account list", () => {
  assert.equal(
    getAddressIdentityPresentation({
      account: walletAccount,
      fallbackLabel: "0x1111...1111",
      resolvedAvatar: null,
      resolvedName: null,
    }).avatarKind,
    "walletFallback",
  );
  assert.equal(
    getAddressIdentityPresentation({
      account: null,
      fallbackLabel: "0x2222...2222",
      resolvedAvatar: null,
      resolvedName: null,
    }).avatarKind,
    "none",
  );
});

test("resolved avatars remain available for non-wallet identities", () => {
  assert.deepEqual(
    getAddressIdentityPresentation({
      account: null,
      fallbackLabel: "0x2222...2222",
      resolvedAvatar: "https://example.com/avatar.png",
      resolvedName: "counterparty.gwei",
    }),
    { avatarKind: "resolved", label: "counterparty.gwei" },
  );
});

test("GNS identities load avatar text records through the safe shared renderer", async () => {
  const ensUtils = await readFile(
    new URL("../../src/lib/ensUtils.ts", import.meta.url),
    "utf8",
  );
  const addressPill = await readFile(
    new URL(
      "../../src/components/shared/LabeledAddressPopover.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(ensUtils, /if \(wei\.isGwei\(name\)\)[\s\S]*getGweiAvatar\(name\)/u);
  assert.match(ensUtils, /args: \[tokenId, "avatar"\]/u);
  assert.match(addressPill, /useCachedAvatarSrc\(identity\?\.avatar\)/u);
  assert.doesNotMatch(addressPill, /src=\{identity\.avatar\}/u);
});
