import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

type SourceFile = {
  path: string;
  url: URL;
};

const componentsUrl = new URL("../../src/components/", import.meta.url);
const appUrl = new URL("../../src/app/", import.meta.url);

const compatibilityFacades = [
  "AssetChangesDisplay.tsx",
  "BatchTransactionConfirmation.tsx",
  "Erc7715PermissionConfirmation.tsx",
  "Erc7715PermissionEditableControls.tsx",
  "SignatureRequestConfirmation.tsx",
  "TokenHoldings.tsx",
  "TokenTransfer.tsx",
  "TransactionConfirmation.tsx",
  "TxDetailModal.tsx",
  "TxDetailScreen.tsx",
  "TxStatusList.tsx",
  "useErc7715PermissionAsset.ts",
];

const pureModules = [
  { path: "app/requestModel.ts", url: new URL("requestModel.ts", appUrl) },
  {
    path: "components/AssetChanges/assetChangesModel.ts",
    url: new URL("AssetChanges/assetChangesModel.ts", componentsUrl),
  },
  {
    path: "components/Activity/activityModel.ts",
    url: new URL("Activity/activityModel.ts", componentsUrl),
  },
  {
    path: "components/ClearSigning/formatters/valueFormatters.ts",
    url: new URL("ClearSigning/formatters/valueFormatters.ts", componentsUrl),
  },
  {
    path: "components/Erc7715PermissionConfirmation/permissionPresentation.ts",
    url: new URL(
      "Erc7715PermissionConfirmation/permissionPresentation.ts",
      componentsUrl,
    ),
  },
  {
    path: "components/Portfolio/Holdings/transforms.ts",
    url: new URL("Portfolio/Holdings/transforms.ts", componentsUrl),
  },
  {
    path: "components/SignatureConfirmation/signaturePresentation.ts",
    url: new URL(
      "SignatureConfirmation/signaturePresentation.ts",
      componentsUrl,
    ),
  },
  {
    path: "components/TransactionConfirmation/transactionPresentation.ts",
    url: new URL("TransactionConfirmation/transactionPresentation.ts", componentsUrl),
  },
  {
    path: "components/TransactionConfirmation/transactionValue.ts",
    url: new URL("TransactionConfirmation/transactionValue.ts", componentsUrl),
  },
  {
    path: "components/TransactionDetails/forceInclusionState.ts",
    url: new URL("TransactionDetails/forceInclusionState.ts", componentsUrl),
  },
  {
    path: "components/TransactionDetails/formatting.ts",
    url: new URL("TransactionDetails/formatting.ts", componentsUrl),
  },
  {
    path: "components/Transfer/formatting.ts",
    url: new URL("Transfer/formatting.ts", componentsUrl),
  },
];

async function collectSourceFiles(
  directory: URL,
  relativeDirectory = "",
): Promise<SourceFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<SourceFile[]> => {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        return collectSourceFiles(
          new URL(`${entry.name}/`, directory),
          relativePath,
        );
      }
      if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
        return [{ path: relativePath, url: new URL(entry.name, directory) }];
      }
      return [];
    }),
  );
  return nested.flat();
}

test("multi-file component domains publish a local audit map", async () => {
  const entries = await readdir(componentsUrl, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directoryUrl = new URL(`${entry.name}/`, componentsUrl);
    const sourceFiles = await collectSourceFiles(directoryUrl);
    if (sourceFiles.length < 2) continue;

    const childNames = await readdir(directoryUrl);
    assert.ok(
      childNames.includes("README.md"),
      `${entry.name}/ has ${sourceFiles.length} source files but no README.md audit map`,
    );
  }
});

test("domain-free mobile primitives do not depend on wallet features or effects", async () => {
  const files = await collectSourceFiles(new URL("ui/", componentsUrl), "ui");

  for (const file of files) {
    const source = await readFile(file.url, "utf8");
    assert.doesNotMatch(source, /\bchrome\./, file.path);
    assert.doesNotMatch(source, /\bfetch\s*\(/, file.path);
    assert.doesNotMatch(
      source,
      /from\s+["'](?:@\/(?:chrome|pages|App)(?:\/|["'])|@\/components\/(?!ui(?:\/|["']))|\.\.\/)/,
      file.path,
    );
  }
});

test("feature components never depend back on the App composition root", async () => {
  const files = [
    ...(await collectSourceFiles(componentsUrl)),
    ...(await collectSourceFiles(appUrl, "app")),
  ];

  for (const file of files) {
    const source = await readFile(file.url, "utf8");
    assert.doesNotMatch(
      source,
      /from\s+["'](?:@\/App|(?:\.\.\/)+App)["']/,
      file.path,
    );
  }
});

test("migrated root facades stay tiny and policy-free", async () => {
  for (const path of compatibilityFacades) {
    const source = await readFile(new URL(path, componentsUrl), "utf8");
    const lines = source.split(/\r?\n/).length;
    assert.ok(lines <= 12, `${path} has ${lines} lines; facades only re-export`);
    assert.doesNotMatch(source, /\b(?:chrome\.|fetch\s*\(|use[A-Z]\w*\s*\()/, path);
    assert.doesNotMatch(source, /\b(?:function|const|let|class)\b/, path);
  }
});

test("pure feature models stay independent of rendering and effects", async () => {
  for (const file of pureModules) {
    const source = await readFile(file.url, "utf8");
    assert.doesNotMatch(
      source,
      /from\s+["'](?:react|@chakra-ui\/react)(?:\/|["'])/,
      file.path,
    );
    assert.doesNotMatch(
      source,
      /\b(?:chrome\.|fetch\s*\(|setTimeout\s*\(|setInterval\s*\()/,
      file.path,
    );
  }
});
