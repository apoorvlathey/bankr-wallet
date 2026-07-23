import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await readFile(resolve(extensionRoot, "package.json"), "utf8"),
);
if (packageJson.license !== "GPL-3.0-only") {
  throw new Error("Extension package license must remain GPL-3.0-only");
}

const buildDirectory = resolve(
  extensionRoot,
  process.env.BROWSER === "firefox" ? "build-firefox" : "build",
);
await Promise.all([
  copyFile(resolve(extensionRoot, "COPYING"), resolve(buildDirectory, "LICENSE.txt")),
  copyFile(
    resolve(extensionRoot, "THIRD_PARTY_NOTICES.md"),
    resolve(buildDirectory, "THIRD_PARTY_NOTICES.txt"),
  ),
]);

const sourceTag = `v${packageJson.version}`;
const releaseVersion = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);
const isV4Release =
  releaseVersion !== null && Number(releaseVersion[1]) >= 4;
const sourceUrl = isV4Release
  ? `https://github.com/apoorvlathey/walletchan/tree/${sourceTag}`
  : "the local source checkout that produced this development build";
const releaseStatus = isV4Release
  ? ""
  : `This is an unreleased pre-v4 development build. Release packaging is
blocked until the extension version reaches 4.0.0.

`;
const sourceNotice = `WalletChan Browser Extension ${packageJson.version}

License: GNU General Public License version 3 only (GPL-3.0-only)

${releaseStatus}The complete corresponding WalletChan source is available at:
${sourceUrl}

Build instructions:
${isV4Release ? `${sourceUrl}/_docs/DEVELOPMENT.md` : "_docs/DEVELOPMENT.md in that checkout"}

The exact unmodified snarkjs 0.7.5 source bundled by this extension is at:
https://github.com/iden3/snarkjs/tree/v0.7.5

Exact source locations for its GPL dependencies are listed in
THIRD_PARTY_NOTICES.txt.

If a release tag or source archive is unavailable, do not distribute this
binary. Contact the publisher through:
https://github.com/apoorvlathey/walletchan
`;
await writeFile(resolve(buildDirectory, "SOURCE_CODE.txt"), sourceNotice);

process.stdout.write(
  `Packaged GPL, third-party, and source notices in ${buildDirectory}.\n`,
);
