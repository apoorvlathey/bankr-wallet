import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../src/components/Settings/AddChain.tsx", import.meta.url),
  "utf8",
);
const developerSettingSource = await readFile(
  new URL(
    "../../src/components/Settings/ImpersonatedTransactionSetting.tsx",
    import.meta.url,
  ),
  "utf8",
);
const advancedDetailsSource = await readFile(
  new URL(
    "../../src/components/Settings/AddChainAdvancedDetails.tsx",
    import.meta.url,
  ),
  "utf8",
);
const rpcEndpointEditorSource = await readFile(
  new URL(
    "../../src/components/Settings/RpcEndpointEditor.tsx",
    import.meta.url,
  ),
  "utf8",
);
const rpcEndpointManagerSource = await readFile(
  new URL(
    "../../src/components/Settings/RpcEndpointManager.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("manual add-network setup starts at the RPC field", () => {
  assert.match(
    source,
    /<Input\s+autoFocus\s+placeholder="https:\/\/rpc\.example\.com or localhost:8545"/u,
  );
});

test("saved RPC endpoint forms own the developer opt-in", () => {
  assert.doesNotMatch(
    rpcEndpointManagerSource,
    /ImpersonatedTransactionSetting/u,
  );
  assert.match(
    rpcEndpointEditorSource,
    /label="For Devs"[\s\S]*?autoScrollOnOpen[\s\S]*?<ImpersonatedTransactionSetting/u,
  );
  assert.match(
    rpcEndpointEditorSource,
    /allowImpersonatedTransactions[\s\S]*?onSubmit\(\{[\s\S]*?allowImpersonatedTransactions: true/u,
  );
  assert.doesNotMatch(
    rpcEndpointEditorSource,
    /Give this endpoint a recognizable label\./u,
  );
  assert.match(
    rpcEndpointEditorSource,
    /id="rpc-endpoint-url"\s+type="text"\s+inputMode="url"/u,
  );
  assert.doesNotMatch(
    rpcEndpointEditorSource,
    /id="rpc-endpoint-url"\s+type="url"/u,
  );
});

test("manual add-network setup uses the amber commitment action", () => {
  assert.match(
    source,
    /primaryAction=\{[\s\S]*?<Button\s+variant="brand"[\s\S]*?>\s*Add network\s*<\/Button>/u,
  );
});

test("manual add-network advanced details expose the per-RPC developer opt-in", () => {
  assert.match(
    source,
    /label="Advanced network details"[\s\S]*?autoScrollOnOpen/u,
  );
  assert.match(source, /<AddChainAdvancedDetails/u);
  assert.match(
    advancedDetailsSource,
    /Native token symbol[\s\S]*?<InlineDisclosure\s+label="For Devs"/u,
  );
  assert.match(advancedDetailsSource, /showSectionLabel=\{false\}/u);
  assert.match(
    advancedDetailsSource,
    /label="For Devs"[\s\S]*?autoScrollOnOpen/u,
  );
  assert.match(developerSettingSource, />\s*For Devs\s*</u);
  assert.match(
    developerSettingSource,
    />\s*This RPC allows sending txs from impersonated accounts\s*</u,
  );
  assert.match(
    developerSettingSource,
    /<Checkbox[\s\S]*?flexDirection="row-reverse"[\s\S]*?variant="commitment"[\s\S]*?>[\s\S]*?This RPC allows sending txs from impersonated accounts[\s\S]*?<\/Checkbox>/u,
  );
  assert.match(
    advancedDetailsSource,
    /<Box px=\{2\}>[\s\S]*?<ImpersonatedTransactionSetting/u,
  );
});
