import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Send keeps one amber commitment path without a Swap detour", async () => {
  const source = await readFile(
    new URL("../../src/components/Transfer/TokenTransfer.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /Swap .* instead/u);
  assert.match(
    source,
    /<Button\s+variant="brand"[\s\S]*?"Review send"[\s\S]*?<\/Button>/u,
  );
});

test("Send balance slider uses a compact amber rounded-square visual thumb", async () => {
  const source = await readFile(
    new URL("../../src/components/Transfer/AmountSection.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<SliderFilledTrack bg="accent\.highlight" \/>/u);
  assert.match(source, /boxSize: "18px"/u);
  assert.match(source, /borderRadius: "5px"/u);
  assert.match(source, /boxSize="24px"/u);
});

test("Send conversion value switches currency mode inside the amount field before MAX", async () => {
  const source = await readFile(
    new URL("../../src/components/Transfer/AmountSection.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /pr=\{amountInputRightPadding\}/u);
  assert.match(source, /isUsdMode\s*\? "168px"\s*:\s*"132px"/u);
  assert.match(source, /title=\{modeSwitchLabel\}/u);
  assert.match(source, /onClick=\{toggleAmountMode\}/u);
  assert.match(source, /aria-label=\{[\s\S]*?Enter amount in USD/u);
  assert.match(source, /maxW=\{isUsdMode \? "112px" : "76px"\}/u);
  assert.match(source, /h="calc\(100% - 6px\)"[\s\S]*?top="3px"[\s\S]*?right="3px"/u);
  assert.doesNotMatch(source, /flex="1 1 auto"[\s\S]*?toggleAmountMode/u);
  assert.doesNotMatch(source, /<\/InputGroup>\s*\{token && amount/u);
  assert.doesNotMatch(source, /justify="space-between"[\s\S]*?toggleAmountMode/u);
});

test("Send advanced-data actions share the disclosure header", async () => {
  const source = await readFile(
    new URL("../../src/components/Transfer/CalldataSection.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /<HStack w="full" minH="32px"[\s\S]*?isHexDataExpanded &&[\s\S]*?aria-label="Advanced transaction mode"[\s\S]*?<\/HStack>\s*\{canShowDeployToggle/u,
  );
  assert.doesNotMatch(source, /<HStack justify="flex-end"/u);
});

test("Send token selector hugs its content inside the asset card inset", async () => {
  const source = await readFile(
    new URL(
      "../../src/components/Transfer/TokenSelectionSection.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /flex="0 1 auto"/u);
  assert.match(source, /triggerContentAlign="right"/u);
  assert.match(
    source,
    /sx=\{\{ "> button": \{ maxWidth: "144px" \} \}\}/u,
  );
});
