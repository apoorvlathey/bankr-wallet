import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Safe owner lists reuse the shared interactive address pill", async () => {
  const [verificationCard, settingsSection, addressPill] = await Promise.all([
    readFile(new URL("../../src/components/SafeAccount/SafeVerificationCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/SafeAccount/SafeChainSettingsSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shared/LabeledAddressPopover.tsx", import.meta.url), "utf8"),
  ]);

  for (const safeOwnerSurface of [verificationCard, settingsSection]) {
    assert.match(safeOwnerSurface, /<LabeledAddressPopover/u);
    assert.match(safeOwnerSurface, /contextLabel="Safe owner address"/u);
    assert.match(safeOwnerSurface, /explorer=\{chain\?\.explorer\}/u);
    assert.match(safeOwnerSurface, /showFallbackAvatar/u);
  }

  assert.match(
    verificationCard,
    /key=\{owner\}[\s\S]*?w="full"[\s\S]*?justify="space-between"[\s\S]*?<LabeledAddressPopover[\s\S]*?<Badge flexShrink=\{0\}>\{ownerType\}<\/Badge>/u,
  );

  assert.match(addressPill, /account\?: Account \| null/u);
  assert.match(addressPill, /showFallbackAvatar\?: boolean/u);
  assert.match(addressPill, /<AddressContactAvatar address=\{address\} avatar=\{null\} size=\{20\} \/>/u);
  assert.match(addressPill, /<AddressActionsPopover/u);
  assert.match(addressPill, /AddressContactEditorModal/u);
});

test("owner discovery labels imported Safes without disabling their review row", async () => {
  const [entryScreen, discoveredRow, verificationCard, capabilityBadge] = await Promise.all([
    readFile(new URL("../../src/components/SafeAccount/SafeEntryScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/SafeAccount/DiscoveredSafeRow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/SafeAccount/SafeVerificationCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/SafeAccount/SafeCapabilityBadge.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(entryScreen, /importedSafeAddresses\.has\(candidate\.address\.toLowerCase\(\)\)/u);
  assert.match(discoveredRow, /isAlreadyAdded\?: boolean/u);
  assert.match(discoveredRow, /<Badge variant="success"[\s\S]*?Already added[\s\S]*?<\/Badge>/u);
  assert.match(discoveredRow, /as="button"[\s\S]*?onClick=\{onSelect\}/u);
  assert.doesNotMatch(discoveredRow, /isDisabled=\{isAlreadyAdded\}/u);
  assert.match(entryScreen, /isAlreadyAdded=\{alreadyImported\}/u);
  assert.match(verificationCard, /isAlreadyAdded=\{isAlreadyAdded\}/u);
  assert.match(capabilityBadge, /if \(isAlreadyAdded\)[\s\S]*?<Badge variant="success">Already added<\/Badge>/u);
});
