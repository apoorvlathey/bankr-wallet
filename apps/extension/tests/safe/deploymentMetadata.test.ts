import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import metadata from "../../src/chrome/safe/deploymentMetadata.generated.json";

const require = createRequire(import.meta.url);
const packageName = "@safe-global/safe-deployments";
const officialPackage = require(`${packageName}/package.json`) as {
  version: string;
};
const artifactNames = {
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
} as const;

test("compact Safe metadata exactly matches every pinned official artifact", () => {
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.packageVersion, officialPackage.version);

  for (const [version, names] of Object.entries(artifactNames)) {
    const generatedNetworkAliases =
      metadata.networkAliases[version as keyof typeof metadata.networkAliases];
    const generatedArtifacts =
      metadata.artifacts[version as keyof typeof metadata.artifacts];

    for (const [kind, fileName] of Object.entries(names)) {
      const official = require(
        `${packageName}/dist/assets/v${version}/${fileName}.json`,
      ) as {
        contractName: string;
        version: string;
        released: boolean;
        networkAddresses: unknown;
        deployments: unknown;
      };
      assert.deepEqual(generatedNetworkAliases, official.networkAddresses);
      assert.deepEqual(
        generatedArtifacts[kind as keyof typeof generatedArtifacts],
        {
          contractName: official.contractName,
          version: official.version,
          released: official.released,
          deployments: official.deployments,
        },
      );
    }
  }
});
