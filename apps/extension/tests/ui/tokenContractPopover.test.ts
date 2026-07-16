import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const COMPONENT_ROOT = new URL("../../src/components/", import.meta.url);

async function component(path: string): Promise<string> {
  return readFile(new URL(path, COMPONENT_ROOT), "utf8");
}

test("estimated and confirmed token symbols share contract disclosure", async () => {
  const requestRow = await component("AssetChanges/AssetRow.tsx");
  const receiptRow = await component(
    "TransactionDetails/Erc20TransferRow.tsx",
  );
  const popover = await component("shared/TokenContractPopover.tsx");

  for (const source of [requestRow, receiptRow]) {
    assert.match(source, /import \{ TokenContractPopover \} from/);
    const triggers = source.match(
      /<TokenContractPopover[\s\S]*?<\/TokenContractPopover>/gu,
    );
    assert.ok(triggers?.length, "expected a token-contract popover trigger");
    assert.ok(
      triggers.some(
        (trigger) =>
          trigger.includes("{symbolText}") && !trigger.includes("{logo}"),
      ),
      "the visible token symbol must remain the disclosure trigger",
    );
  }
  assert.match(popover, /aria-label=\{`Show \$\{symbol\} token contract`\}/);
  assert.match(popover, /cursor="help"/);
  assert.match(popover, /_hover=\{\{ color: "accent\.highlight" \}\}/);
  assert.match(popover, /_focusVisible=\{\{/);
  assert.match(popover, /outlineColor: "accent\.highlight"/);
  assert.match(popover, /navigator\.clipboard\.writeText\(address\)/);
  assert.match(popover, /href=\{explorerUrl\}/);
  assert.match(popover, /View \$\{symbol\} token on explorer/);
});
