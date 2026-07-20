import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../../src/${path}`, import.meta.url), "utf8");

test("network pickers reuse the shared selector or its ordering model", async () => {
  const [shared, swap, send, homepage, dappDock] = await Promise.all([
    readSource("components/shared/NetworkSelector/NetworkSelectorScreen.tsx"),
    readSource("components/Swap/BridgeChainTokenPickerScreen.tsx"),
    readSource("components/Transfer/NetworkPicker.tsx"),
    readSource("components/PortfolioTabs.tsx"),
    readSource("components/HomeDappDock.tsx"),
  ]);

  assert.match(shared, /label="Search networks"/u);
  assert.match(shared, /sortNetworkSelectorOptions\(networks\)/u);
  assert.match(shared, /Native token · \{network\.nativeSymbol\}/u);
  assert.match(swap, /<NetworkSelectorScreen/u);
  assert.match(send, /<NetworkSelectorScreen/u);
  assert.match(homepage, /<NetworkSelectorScreen/u);
  assert.match(homepage, /includeAllNetworks/u);
  assert.match(dappDock, /sortNetworkSelectorOptions\(chains\)/u);
});
