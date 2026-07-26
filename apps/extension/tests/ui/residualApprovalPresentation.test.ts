import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL(
    "../../src/components/AssetChanges/ResidualApprovalBanner.tsx",
    import.meta.url,
  ),
  "utf8",
);
const panelSource = await readFile(
  new URL(
    "../../src/components/AssetChanges/AssetChangesPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const metadataSource = await readFile(
  new URL(
    "../../src/chrome/simulation/approvalMetadata.ts",
    import.meta.url,
  ),
  "utf8",
);

test("residual approval cleanup stays compact and explains its batch mutation", () => {
  assert.match(source, /"Revoke\?"/);
  assert.match(source, />\s*Revoke all\s*</);
  assert.match(source, /remainingApprovals\.length > 1/);
  assert.match(source, /\.onRevokeAll\(remainingApprovals\)/);
  assert.match(source, /loadingText="Adding all"/);
  assert.match(source, /textAlign="center"/);
  assert.match(source, /trigger="hover"/);
  assert.match(source, /bg="status\.warning\.bg"/);
  assert.match(source, /color="status\.warning\.fg"/);
  assert.match(source, /mb=\{flushBottom \? -3 : 0\}/);
  assert.match(source, /spacing=\{2\}/);
  assert.match(source, /py=\{2\}/);
  assert.match(source, /minH="36px"/);
  assert.match(source, /size="26px"/);
  assert.match(
    source,
    /<TokenContractPopover[\s\S]*?address=\{approval\.tokenAddress\}[\s\S]*?explorer=\{explorerUrl \|\| undefined\}[\s\S]*?\{approval\.symbol\}[\s\S]*?<\/TokenContractPopover>/,
  );
  assert.match(
    source,
    /Adds batch call at the end of transaction request to[\s\S]*revoke allowance/,
  );
  assert.doesNotMatch(source, /retains access/);
  assert.doesNotMatch(
    source,
    /The spender can still use this token allowance after the request/,
  );
  assert.doesNotMatch(source, /spenderLabel|spenderEns/);
  assert.match(
    metadataSource,
    /\.filter\(\(change\) => !\("sourceCallIndex" in change\)\)/,
  );
  assert.match(
    panelSource,
    /pb=\{residualApprovals\.length > 0 \? 0 : 2\}/,
  );
  assert.match(
    panelSource,
    /<ResidualApprovalBanner[\s\S]*?flushBottom[\s\S]*?\/>/,
  );
});
