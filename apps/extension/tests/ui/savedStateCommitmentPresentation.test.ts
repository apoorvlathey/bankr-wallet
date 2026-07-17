import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const commitmentSurfaces = [
  {
    path: "../../src/components/AccountSettings.tsx",
    labels: [
      { text: "Save changes", count: 1 },
      { text: "Save", count: 2 },
    ],
  },
  {
    path: "../../src/components/EditCustomTokenModal.tsx",
    labels: [{ text: "Save changes", count: 1 }],
  },
  {
    path: "../../src/components/Settings/EditChain.tsx",
    labels: [
      { text: "Save anyway", count: 1 },
      { text: "Save changes", count: 1 },
    ],
  },
  {
    path: "../../src/components/Settings/EnsBrowsingSettings.tsx",
    labels: [{ text: "Save", count: 1, dynamic: true }],
  },
  {
    path: "../../src/components/Settings/RpcEndpointEditor.tsx",
    labels: [{ text: "Save endpoint", count: 1, dynamic: true }],
  },
] as const;

test("saved-state commitments use the amber brand button variant", async () => {
  for (const surface of commitmentSurfaces) {
    const source = await readFile(new URL(surface.path, import.meta.url), "utf8");
    const brandButtons = [...source.matchAll(/<Button\b[\s\S]*?<\/Button>/gu)]
      .map(([button]) => button)
      .filter((button) => /\bvariant="brand"/u.test(button));

    for (const label of surface.labels) {
      const escapedLabel = label.text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const matches = brandButtons.filter((button) => (
        "dynamic" in label && label.dynamic
          ? button.includes(`"${label.text}"`)
          : new RegExp(`>\\s*${escapedLabel}\\s*<\\/Button>$`, "u").test(button)
      ));
      assert.equal(
        matches.length,
        label.count,
        `${surface.path}: ${label.text} must use variant=\"brand\"`,
      );
    }
  }
});
