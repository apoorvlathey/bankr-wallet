import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../../src/${path}`, import.meta.url), "utf8");

test("network pickers reuse the shared selector or its ordering model", async () => {
  const [shared, swap, send, tokenSelector, homepage, dappDock] = await Promise.all([
    readSource("components/shared/NetworkSelector/NetworkSelectorScreen.tsx"),
    readSource("components/Swap/BridgeChainTokenPickerScreen.tsx"),
    readSource("components/Transfer/NetworkPicker.tsx"),
    readSource("components/Swap/TokenSelector.tsx"),
    readSource("components/PortfolioTabs.tsx"),
    readSource("components/HomeDappDock.tsx"),
  ]);

  assert.match(shared, /label="Search networks"/u);
  assert.match(shared, /sortNetworkSelectorOptions\(networks\)/u);
  assert.match(shared, /Native token · \{network\.nativeSymbol\}/u);
  assert.match(swap, /<NetworkSelectorScreen/u);
  assert.match(send, /<NetworkSelectorScreen/u);
  assert.match(tokenSelector, /<NetworkSelectorScreen/u);
  assert.match(homepage, /<NetworkSelectorScreen/u);
  assert.match(homepage, /includeAllNetworks/u);
  assert.match(dappDock, /sortNetworkSelectorOptions\(chains\)/u);
});

test("Send and Swap token pickers share the compact nested network trigger", async () => {
  const [trigger, sendPicker, swapPicker, swapModal] = await Promise.all([
    readSource("components/shared/TokenPickerNetworkButton.tsx"),
    readSource("components/Swap/TokenPickerContent.tsx"),
    readSource("components/Swap/BridgeChainTokenPickerScreen.tsx"),
    readSource("components/Swap/BridgeChainTokenModal.tsx"),
  ]);

  assert.match(trigger, /Change network, currently \$\{chainName\}/u);
  assert.match(trigger, />\s*on\s*</u);
  assert.match(trigger, /ChevronDownIcon/u);
  assert.match(trigger, /h="24px"/u);
  assert.match(trigger, /borderColor="border\.default"/u);
  assert.match(sendPicker, /<TokenPickerNetworkButton/u);
  assert.match(swapPicker, /<TokenPickerNetworkButton/u);
  assert.match(swapModal, /setPanel\("chains"\)/u);
  assert.match(swapModal, /setPanel\("tokens"\)[\s\S]*?onSelectChain\(chainId\)/u);
});
