import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const DEFAULT_MAXIMUM_LINES = 400;
const sourceUrl = new URL("../../src/", import.meta.url);

// These are migration ratchets, not acceptable end-state sizes. Lower or
// remove an entry whenever its module is decomposed; never raise one to make a
// feature fit. Frozen preview fixtures remain listed so growth stays explicit.
const transitionalBudgets: Record<string, number> = {
  "App.tsx": 3_566,
  "components/AccountSettings.tsx": 1_170,
  "components/AccountSwitcher.tsx": 472,
  "components/AddAccount.tsx": 813,
  "components/BatchCallsList.tsx": 839,
  "components/CalldataDecoder.tsx": 468,
  "components/DelegatedPermissionsSection.tsx": 424,
  "components/ERC20ApproveDisplay.tsx": 807,
  "components/EditDelegateScreen.tsx": 586,
  "components/Erc7715PermissionConfirmation/Erc7715PermissionEditableControls.tsx": 907,
  "components/GasEstimateDisplay.tsx": 834,
  "components/HomeDappDock.tsx": 436,
  "components/MultiTxGasEstimateDisplay.tsx": 1_446,
  "components/PortfolioHoldingRows.tsx": 437,
  "components/PortfolioTabs.tsx": 741,
  "components/ScreenTransition.tsx": 548,
  "components/SeedAddressPicker.tsx": 590,
  "components/SeedPhraseSetup.tsx": 615,
  "components/Settings/AddChain.tsx": 550,
  "components/Settings/Chains.tsx": 478,
  "components/Settings/EnsBrowsingSettings.tsx": 666,
  "components/Settings/index.tsx": 406,
  "components/Settings/settingsRegistry.tsx": 455,
  "components/Swap/BridgeChainTokenModal.tsx": 709,
  "components/Swap/BridgeChainTokenPickerScreen.tsx": 460,
  "components/Swap/SwapConfirmation.tsx": 828,
  "components/Swap/TokenSelector.tsx": 407,
  "components/shared/PrivateKeyInput.tsx": 405,
  "hooks/useErc20InlineSummary.ts": 451,
  "pages/EnsSetupKubo.tsx": 468,
  "preview/PreviewScreens.tsx": 741,
  "preview/fixtures.ts": 731,
  "preview/previewChrome.ts": 987,
  "preview/previewEnvironment.ts": 429,
  "theme/recipes/actions.ts": 419,
  "theme/tokens.ts": 408,
};

type SourceFile = {
  path: string;
  url: URL;
};

async function collectSourceFiles(
  directory: URL,
  relativeDirectory: string,
): Promise<SourceFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<SourceFile[]> => {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        return collectSourceFiles(new URL(`${entry.name}/`, directory), relativePath);
      }
      if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
        return [{ path: relativePath, url: new URL(entry.name, directory) }];
      }
      return [];
    }),
  );
  return nested.flat();
}

async function getRendererSourceFiles(): Promise<SourceFile[]> {
  const directories = [
    "app",
    "components",
    "contexts",
    "hooks",
    "pages",
    "preview",
    "theme",
  ];
  const nested = await Promise.all(
    directories.map((directory) =>
      collectSourceFiles(new URL(`${directory}/`, sourceUrl), directory),
    ),
  );
  return [
    { path: "App.tsx", url: new URL("App.tsx", sourceUrl) },
    ...nested.flat(),
  ];
}

test("renderer modules stay within default or ratcheting size budgets", async () => {
  const files = await getRendererSourceFiles();
  const encounteredBudgets = new Set<string>();

  for (const file of files) {
    const source = await readFile(file.url, "utf8");
    const lineCount = source.split(/\r?\n/).length;
    const transitionalBudget = transitionalBudgets[file.path];
    const maximumLines = transitionalBudget ?? DEFAULT_MAXIMUM_LINES;

    if (transitionalBudget !== undefined) {
      encounteredBudgets.add(file.path);
      assert.ok(
        lineCount > DEFAULT_MAXIMUM_LINES,
        `${file.path} is now ${lineCount} lines; remove its stale transitional budget`,
      );
    }

    assert.ok(
      lineCount <= maximumLines,
      `${file.path} has ${lineCount} lines; renderer budget is ${maximumLines}`,
    );
  }

  assert.deepEqual(
    [...encounteredBudgets].sort(),
    Object.keys(transitionalBudgets).sort(),
    "Remove budgets for deleted or moved renderer modules",
  );
});
