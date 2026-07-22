import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public home selects accounts while Settings reuses the picker for management", async () => {
  const [switcherSource, pickerSource, settingsSource, registrySource, appSource] =
    await Promise.all([
      readFile(new URL("../../src/components/AccountSwitcher.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../../src/components/AccountPicker/AccountPickerScreen.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../src/components/Settings/AccountsSettings.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../src/components/Settings/index.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../src/App.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(switcherSource, /title="Choose account"/);
  assert.match(switcherSource, /mode="select"/);
  assert.match(switcherSource, /onAccountSelect={selectAccount}/);

  assert.match(settingsSource, /title="Accounts"/);
  assert.match(settingsSource, /mode="manage"/);
  assert.doesNotMatch(settingsSource, /onAccountSelect=/);
  assert.match(
    pickerSource,
    /if \(mode === "manage"\) onAccountSettings\(account\);[\s\S]*else onAccountSelect\?\.\(account\)/,
  );

  assert.match(
    registrySource,
    /renderRootLeaf\("appearance"\),[\s\S]*accountsRow,[\s\S]*renderRootLeaf\("chains"\)/,
  );
  assert.match(appSource, /openAccountSettingsView\(account, "settingsAccounts"\)/);
  assert.match(appSource, /setSettingsInitialTab\("accounts"\)/);
});
