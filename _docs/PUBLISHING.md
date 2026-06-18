# Publishing & Distribution

WalletChan is distributed through two channels.

## Distribution Channels

|                      | GitHub Releases (sideloading)                                          | Chrome Web Store                                                                                          |
| -------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Format**           | ZIP (load as unpacked in developer mode)                               | CWS package                                                                                               |
| **Update mechanism** | Manual (download new zip, refresh)                                     | CWS built-in auto-update                                                                                  |
| **Audience**         | Beta testers, developers                                               | General public                                                                                            |
| **Speed**            | Instant (GitHub Release publishes immediately)                         | CWS review (hours to days)                                                                                |
| **Listing**          | [GitHub Releases](https://github.com/apoorvlathey/walletchan/releases) | [Chrome Web Store](https://chromewebstore.google.com/detail/bankrwallet/kofbkhbkfhiollbhjkbebajngppmpbgc) |

### Two Zip Variants

CWS **rejects** uploads containing a `key` field in `manifest.json` (it assigns its own extension ID). The shipped `manifest.json` does not include `key`, so `pnpm zip` and `pnpm zip:cws` produce equivalent output today; the strip step in `scripts/strip-cws-keys.sh` is kept as a safety net in case `key` is ever re-introduced.

Both `zip` and `zip:cws` run `pnpm build` automatically — no need to build separately first.

## Release Process

### 1. Bump version and push tag

```bash
pnpm release:patch  # 0.2.0 → 0.2.1 (bug fixes)
pnpm release:minor  # 0.2.0 → 0.3.0 (new features)
pnpm release:major  # 0.2.0 → 1.0.0 (breaking changes)
```

**Important:** The working tree must be clean (no uncommitted changes) before running a release command.

This automatically (via `scripts/release.sh`):

1. Bumps the version in `apps/extension/package.json`
2. Syncs the version to `apps/extension/public/manifest.json`
3. Commits both files from the repo root (so monorepo paths resolve correctly)
4. Creates a git tag (e.g. `v0.2.1`)
5. Pushes to origin with tags

### 2. GitHub Actions builds the release

The [release workflow](/.github/workflows/release.yml) triggers on `v*` tags and:

1. Runs `pnpm zip` (which builds the extension and creates the zip)
2. Publishes `walletchan-vX.Y.Z.zip` to [GitHub Releases](https://github.com/apoorvlathey/walletchan/releases)

Users can download the zip from GitHub Releases and load it as an unpacked extension in developer mode.

### 3. Upload to Chrome Web Store

1. Create the CWS zip (builds automatically):
   ```bash
   pnpm zip:cws
   ```
2. Go to the [CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Select the WalletChan extension
4. Upload `apps/extension/cws-zip/walletchan-vX.Y.Z.zip` (not the GitHub Release zip)
5. Fill in any release notes
6. Submit for review

Once approved, **CWS users** receive the update.

### Manual release (optional)

If you need to create a release without the automated workflow:

```bash
pnpm zip        # builds + zips with `key` (for GitHub Release)
pnpm zip:cws    # builds + zips without `key` (for CWS upload)
```

Then upload `apps/extension/zip/walletchan-vX.Y.Z.zip` to a new GitHub release.

## NPM Packages: WalletChan RPC and MCP

`apps/walletchan-rpc` and `apps/walletchan-mcp` are published separately to npm as `@walletchan/rpc` and `@walletchan/mcp`. This flow is independent of the browser extension `pnpm release:*` commands.

Use patch/minor/major according to semver, then update package metadata in the same commit as the code change:

- `apps/walletchan-rpc/package.json` `version`
- `apps/walletchan-mcp/package.json` `version`
- `apps/walletchan-mcp/src/mcpServer.ts` `serverInfo.version`
- `apps/walletchan-mcp/package.json` `dependencies["@walletchan/rpc"]` when MCP needs the new RPC package
- `pnpm-lock.yaml` via `pnpm install --lockfile-only`

For an RPC + MCP release:

```bash
pnpm install --lockfile-only
pnpm build:walletchan-mcp

pnpm publish:walletchan-rpc:dry-run
pnpm publish:walletchan-mcp:dry-run

pnpm publish:walletchan-rpc
pnpm publish:walletchan-mcp
```

Publish `@walletchan/rpc` before `@walletchan/mcp` when MCP depends on the new RPC version. After publishing, verify npm:

```bash
npm view @walletchan/rpc version
npm view @walletchan/mcp version
```

## GitHub Releases (Sideloading)

GitHub Releases provide a ZIP file for users who want to sideload the extension in developer mode. This is useful for beta testing or trying out the extension before it's approved on CWS.

### How to install from GitHub Release

1. Download `walletchan-vX.Y.Z.zip` from [GitHub Releases](https://github.com/apoorvlathey/walletchan/releases)
2. Extract the zip
3. Go to `chrome://extensions` → enable Developer mode
4. Click "Load unpacked" → select the extracted folder
5. To update: download the new zip, extract, and click the refresh icon on `chrome://extensions`

### Chrome CRX Sideloading Restrictions

Chrome **blocks enabling sideloaded CRX extensions** that aren't from the Chrome Web Store. Dragging a `.crx` file into `chrome://extensions` will install it, but Chrome disables it with the warning: _"This extension is not listed in the Chrome Web Store and may have been added without your knowledge."_

This is why we only distribute ZIP files (for unpacked loading) and not CRX files on GitHub Releases. CRX-based auto-update only works for enterprise/managed installs deployed via group policy (which supplies its own `update_url` via policy, not via the manifest).

### Version Flow

```
pnpm release:patch
  → bumps version in package.json + manifest.json
  → creates git tag v0.2.1
  → pushes to GitHub

GitHub Actions (.github/workflows/release.yml)
  → runs pnpm zip (builds + creates ZIP)
  → attaches to GitHub Release
```

### Update XML Endpoint

The website still serves `update_url` XML at `https://walletchan.com/api/extension/update.xml` for any enterprise installs using the CRX + policy approach. This endpoint fetches the latest GitHub Release version dynamically.

```bash
curl https://walletchan.com/api/extension/update.xml
```

Should return XML with `appid='gmfimlibjdfoeoiohiaipblfklgammci'` and the latest version.

## One-Time Setup (Already Done)

Reference for if signing key or infrastructure needs to be recreated.

### 1. Generate signing key

```bash
openssl genrsa -out walletchan.pem 2048
```

### 2. Get extension ID

Calculate the extension ID from your signing key:

```bash
node -e "
const crypto = require('crypto');
const fs = require('fs');
const pem = fs.readFileSync('walletchan.pem', 'utf8');
const key = crypto.createPrivateKey(pem);
const pubKey = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
const hash = crypto.createHash('sha256').update(pubKey).digest();
const id = Array.from(hash.slice(0, 16))
  .map(b => String.fromCharCode((b >> 4) + 97) + String.fromCharCode((b & 0xf) + 97))
  .join('');
console.log(id);
"
```

### 3. Get public key for manifest.json

Extract the public key to set as the `key` field in `manifest.json`:

```bash
node -e "
const crypto = require('crypto');
const fs = require('fs');
const pem = fs.readFileSync('walletchan.pem', 'utf8');
const key = crypto.createPrivateKey(pem);
const pubKey = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
console.log(pubKey.toString('base64'));
"
```

### 4. Add GitHub Secrets

In the repository settings, add:

- `EXTENSION_SIGNING_KEY`: Base64 encoded .pem file
  ```bash
  base64 -i walletchan.pem | pbcopy  # macOS
  base64 -w 0 walletchan.pem         # Linux
  ```

### 5. Add website environment variable

Add to your website deployment (Vercel, etc.):

```
EXTENSION_ID=gmfimlibjdfoeoiohiaipblfklgammci
```

This is the **self-hosted** extension ID (from step 2), since only CRX-installed users hit the update endpoint.

### 6. Secure backup

Store the `walletchan.pem` file in a password manager. This key is the extension's identity for self-hosted distribution — losing it means self-hosted users won't receive updates.

## Backward Compatibility & Storage Migrations

Chrome extensions auto-update silently. Users cannot choose to stay on an old version. Every release must work seamlessly for users on **any** previously released version.

> **Full storage key reference:** See [`STORAGE.md`](./STORAGE.md) for every key, its shape, which files touch it, and what each version expects.

### How migrations work

`background.ts` listens for `chrome.runtime.onInstalled` with `reason === "update"`. When it fires, the `migrateFromLegacyStorage()` function runs. As a safety net, `App.tsx` also calls the `migrateFromLegacy` message handler if it detects no accounts on load.

### Rules for storage changes

1. **Never remove or rename a storage key without a migration.** If you rename `foo` to `bar`, you must read `foo`, write `bar`, and keep `foo` for at least one release cycle.
2. **Never change the shape of stored data without handling the old shape.** If `accounts` gains a new required field, set a default for entries that lack it.
3. **Migrations must be idempotent.** They can run more than once (onInstalled + App.tsx fallback). Always check if already migrated before writing.
4. **Migrations must not require the wallet to be unlocked.** `onInstalled` fires before the user opens the popup. Only use data from `chrome.storage` (no decryption, no cached passwords).

### Adding a new migration

1. Write a function in `background.ts` (or a dedicated module if complex):
   ```ts
   async function migrateXxx(): Promise<boolean> {
     // Check if already migrated — exit early
     // Read old format
     // Write new format
     // Return true if migrated, false if skipped
   }
   ```
2. Call it from the `onInstalled` `"update"` handler.
3. Add a fallback call from `App.tsx` init if needed (for cases where the service worker was inactive during install).
4. Add a message handler gated with `isExtensionPage(sender)` if the fallback needs it.

### Migration history

| Version | Migration                                                               | What it does                                                                                                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1.0.0  | `migrateFromLegacyStorage`                                              | Creates `accounts` array + `activeAccountId` from legacy `address` / `encryptedApiKey` storage (v0.1.1/v0.2.0 had no multi-account system)                                                                                                       |
| v1.0.0  | Vault key (on first unlock)                                             | `authHandlers.ts` auto-migrates `encryptedApiKey` → `encryptedVaultKeyMaster` + `encryptedApiKeyVault`                                                                                                                                           |
| v1.3.0  | Private key vault-key encryption (on first unlock with master password) | `authHandlers.ts` auto-migrates `pkVault` and `mnemonicVault` entries from password encryption (`salt !== ""`) to vault-key encryption (`salt === ""`). Enables agent password to sign transactions. Idempotent, dual-format support maintained. |
| v3.2.0  | None (additive only)                                                    | `selectedThemeId` added to `chrome.storage.local`. Absence resolves to default `"bauhaus"`, so legacy users see no change. No migration code required. See `_docs/THEMING_PRD.md`.                                                              |
| v3.17.0 | Fresh-install theme initialization                                      | New installs write `selectedThemeId: "midnight"` before onboarding opens. Updates do not write the key, and missing/invalid values still fall back to `"bauhaus"` so existing installs are not auto-changed. No storage shape change.          |

### Testing an update locally

1. Build and load the current extension as unpacked
2. Complete onboarding normally
3. Open the **service worker** DevTools console and strip the new storage to simulate an old user:
   ```js
   // Simulate v0.2.0 storage state
   chrome.storage.local.remove([
     "accounts",
     "encryptedVaultKeyMaster",
     "encryptedApiKeyVault",
     "agentPasswordEnabled",
   ]);
   chrome.storage.sync.remove(["activeAccountId", "tabAccounts"]);
   ```
4. Click **Reload** on `chrome://extensions` (fires `onInstalled` with `reason === "update"`)
5. Open the popup — should show unlock screen, not onboarding
6. Enter password — vault key migration runs on unlock
7. Verify the service worker console shows: `[WalletChan] Legacy storage migration complete: 0x...`

### Pre-release checklist (storage)

Before every release that touches `chrome.storage`:

- [ ] List all storage keys added, removed, or changed
- [ ] For each change: does a user on the previous release have data in the old format?
- [ ] If yes: is there a migration that converts old → new?
- [ ] Is the migration idempotent and does it run without the wallet being unlocked?
- [ ] Test the upgrade path locally using the steps above

## Security Notes

- **Never commit the .pem file** to the repository (it's in `.gitignore`)
- The website API caches GitHub responses for 5 minutes to avoid rate limits
- CWS publishing info and permission justifications are in `CHROME_WEBSTORE.md`
