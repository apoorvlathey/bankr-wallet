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

**Important:** The working tree must be clean before running a release command,
including no untracked files. `scripts/release.sh` checks
`git status --porcelain` so an untracked source or asset cannot affect a local
build while being omitted from the release commit.

**Store artifact rule:** Every extension version bump must be followed by a fresh `pnpm zip:cws` run before uploading to stores. Do not reuse an older zip after changing `apps/extension/package.json` or either manifest version. This regenerates `apps/extension/cws-zip/walletchan-vX.Y.Z.zip` for Chrome Web Store and `apps/extension/zip/walletchan-firefox-vX.Y.Z.zip` for Firefox.

This automatically (via `scripts/release.sh`):

1. Bumps the version in `apps/extension/package.json`
2. Syncs the version to `apps/extension/public/manifest.json` and `apps/extension/manifest.firefox.json`
3. Promotes the populated `[Unreleased]` changelog into the new version
4. Commits the release files from the repo root (so monorepo paths resolve correctly)
5. Creates a git tag (e.g. `v0.2.1`)
6. Pushes to origin with tags

### 2. GitHub Actions builds the release

The [release workflow](/.github/workflows/release.yml) triggers on `v*` tags and:

1. Runs `pnpm zip` (which builds the extension and creates the zip)
2. Publishes `walletchan-vX.Y.Z.zip` to [GitHub Releases](https://github.com/apoorvlathey/walletchan/releases)

Users can download the zip from GitHub Releases and load it as an unpacked extension in developer mode.

### 3. Upload to Chrome Web Store

1. Create the fresh store zips for the bumped version (builds automatically):
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
- `apps/walletchan-rpc/CHANGELOG.md` and/or `apps/walletchan-mcp/CHANGELOG.md`
- publish-facing docs: `apps/walletchan-rpc/README.md`, `apps/walletchan-mcp/README.md`, `_docs/WALLETCHAN_RPC.md`, and `_docs/WALLETCHAN_MCP.md`
- `pnpm-lock.yaml` via `pnpm install --lockfile-only`

Before bumping or publishing, populate the package changelog from the actual code changes:

1. Find the previous published package version with `npm view @walletchan/rpc version` or `npm view @walletchan/mcp version`.
2. Review git history for the package since that release. Useful commands:
   ```bash
   git log --oneline -- apps/walletchan-rpc _docs/WALLETCHAN_RPC.md
   git diff <previous-release-ref>...HEAD -- apps/walletchan-rpc _docs/WALLETCHAN_RPC.md
   git log --oneline -- apps/walletchan-mcp _docs/WALLETCHAN_MCP.md
   git diff <previous-release-ref>...HEAD -- apps/walletchan-mcp _docs/WALLETCHAN_MCP.md
   ```
3. Summarize user-visible changes under `Added`, `Changed`, `Fixed`, and `Security` where relevant. Keep internal-only refactors out unless they affect behavior, packaging, or operations.
4. Move relevant `[Unreleased]` notes into the new version section with the release date, then reset `[Unreleased]` to `_Nothing yet._`.
5. If publishing both packages, update both changelogs and make sure MCP's entry mentions any required RPC version bump.

For an RPC + MCP release:

```bash
pnpm install --lockfile-only
pnpm build:walletchan-mcp
pnpm pack:walletchan-rpc
pnpm pack:walletchan-mcp

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

`background/composition/lifecycle.ts` registers `chrome.runtime.onInstalled`
through `background/lifecycle/installUpdate.ts`. On `reason === "update"`, that
lifecycle invokes `accounts/legacyMigration.ts`'s
`migrateFromLegacyStorage()`. As a safety net, `App.tsx` also calls the
`migrateFromLegacy` message handler if it detects no accounts on load. Both
paths share the wallet secret-operation lock and re-read inside it, so
concurrent invocations remain one idempotent migration rather than committing
mismatched account IDs.

### Rules for storage changes

1. **Never remove or rename a storage key without a migration.** If you rename `foo` to `bar`, you must read `foo`, write `bar`, and keep `foo` for at least one release cycle.
2. **Never change the shape of stored data without handling the old shape.** If `accounts` gains a new required field, set a default for entries that lack it.
3. **Migrations must be idempotent.** They can run more than once (onInstalled + App.tsx fallback). Always check if already migrated before writing.
4. **Migrations must not require the wallet to be unlocked.** `onInstalled` fires before the user opens the popup. Only use data from `chrome.storage` (no decryption, no cached passwords).

### Adding a new migration

1. Write an idempotent migration in its owning domain (or in
   `background/lifecycle/installUpdate.ts` only for a small public-settings
   migration). Never add migration logic to the `background.ts` entrypoint:
   ```ts
   async function migrateXxx(): Promise<boolean> {
     // Check if already migrated — exit early
     // Read old format
     // Write new format
     // Return true if migrated, false if skipped
   }
   ```
2. Inject it through `background/composition/lifecycle.ts` and call it from the
   focused `onInstalled` `"update"` lifecycle.
3. Add a fallback call from `App.tsx` init if needed (for cases where the service worker was inactive during install).
4. Add a message handler gated with `isExtensionPage(sender)` if the fallback needs it.

### Migration history

| Version | Migration                                                               | What it does                                                                                                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1.0.0  | `migrateFromLegacyStorage`                                              | Creates `accounts` array + `activeAccountId` from legacy `address` / `encryptedApiKey` storage (v0.1.1/v0.2.0 had no multi-account system). Current code serializes the update/UI fallback race and repairs stale or missing active IDs left by older builds. |
| v1.0.0  | Vault key (on first unlock)                                             | `authHandlers.ts` auto-migrates `encryptedApiKey` → `encryptedVaultKeyMaster` + `encryptedApiKeyVault`                                                                                                                                           |
| v1.3.0  | Private key vault-key encryption (on first unlock with master password) | `authHandlers.ts` auto-migrates `pkVault` entries from password encryption (`salt !== ""`) to vault-key encryption (`salt === ""`). At that release, seed phrases remained master-password encrypted in V1 `mnemonicVault`; their derived signing keys lived in `pkVault`. Current code still reads that V1 format, while explicit biometric setup can atomically convert it to the V2 dedicated-mnemonic-key format described below. Enables agent password to sign transactions. Idempotent, dual-format support maintained for private keys. |
| v3.2.0  | None (additive only)                                                    | `selectedThemeId` added to `chrome.storage.local`. Absence resolves to default `"bauhaus"`, so legacy users see no change. No migration code required. See `_docs/THEMING_PRD.md`.                                                              |
| v3.17.0 | Fresh-install theme initialization                                      | New installs write `selectedThemeId: "midnight"` before onboarding opens. Updates do not write the key, and missing/invalid values still fall back to `"bauhaus"` so existing installs are not auto-changed. No storage shape change.          |
| next    | Transactional onboarding + lazy/authenticated key hardening             | Fresh setup writes the additive, non-secret `onboardingInitialization` marker before any wallet material. Missing is normal for existing users; a complete wallet is never rolled back because marker cleanup failed, while an owned/abandoned incomplete setup can be removed safely. `passkeyUnlock` is created only after explicit biometric setup. Missing data means biometric unlock is disabled. V1 passkeys remain readable; passkey setup atomically adds the V2 dedicated-key mnemonic vault and authenticated key check, while ordinary password unlock does not rewrite V1 phrases. A partial older `encryptedVaultKeyMaster` + legacy `encryptedApiKey` state converts on the next master unlock, while passkey/agent unlock fails clearly until then. Missing/invalid `autoLockTimeout` becomes the finite 15-minute default; an exact stored `0` remains explicit Never. Browsers without native `storage.session` proactively delete old fallback password-recovery halves and keep Never sessions in memory only; the cleanup also removes stale local fallback ciphertext after a browser later gains native session support without disrupting a valid current native session. Wallet reset rotates `walletConnectStorageNamespace` so replacement wallets cannot inherit SDK sessions, and clears bounded encrypted `sponsoredTransferIntents` retry state. Optional pending-request authority/tag fields and `txHistory.broadcastUncertain` are additive; old stored rows remain decodable and routes fail closed rather than guessing missing authority. No install-time secret decryption or destructive key-format migration is required. Reset, passkey removal, and master-password change clear the passkey wrapper. |

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
