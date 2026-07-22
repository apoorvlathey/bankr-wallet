import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageName = "@safe-global/safe-deployments";
const packageRoot = path.dirname(require.resolve(`${packageName}/package.json`));
const packageJson = require(`${packageName}/package.json`);
const outputPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/chrome/safe/deploymentMetadata.generated.json",
);

const artifactsByVersion = {
  "1.3.0": {
    singleton: "gnosis_safe",
    l2Singleton: "gnosis_safe_l2",
    multiSend: "multi_send",
    fallbackHandler: "compatibility_fallback_handler",
  },
  "1.4.1": {
    singleton: "safe",
    l2Singleton: "safe_l2",
    multiSend: "multi_send",
    fallbackHandler: "compatibility_fallback_handler",
  },
  "1.5.0": {
    singleton: "safe",
    l2Singleton: "safe_l2",
    multiSend: "multi_send",
    fallbackHandler: "compatibility_fallback_handler",
  },
};

const manifest = {
  schemaVersion: 1,
  packageVersion: packageJson.version,
  networkAliases: {},
  artifacts: {},
};

for (const [version, artifacts] of Object.entries(artifactsByVersion)) {
  const released = {};
  let networkAliases = null;
  for (const [kind, fileName] of Object.entries(artifacts)) {
    const artifact = require(path.join(
      packageRoot,
      "dist",
      "assets",
      `v${version}`,
      `${fileName}.json`,
    ));
    if (
      artifact.version !== version ||
      artifact.released !== true ||
      !artifact.contractName ||
      !artifact.networkAddresses ||
      !artifact.deployments
    ) {
      throw new Error(`Invalid released Safe deployment: ${version}/${fileName}`);
    }
    if (
      networkAliases &&
      JSON.stringify(networkAliases) !== JSON.stringify(artifact.networkAddresses)
    ) {
      throw new Error(`Safe ${version} deployment network maps have diverged`);
    }
    networkAliases ??= artifact.networkAddresses;
    released[kind] = {
      contractName: artifact.contractName,
      version: artifact.version,
      released: artifact.released,
      deployments: artifact.deployments,
    };
  }
  manifest.networkAliases[version] = networkAliases;
  manifest.artifacts[version] = released;
}

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Wrote ${path.relative(process.cwd(), outputPath)}\n`);
