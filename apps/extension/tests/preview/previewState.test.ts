import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePreviewState,
  previewStateUrl,
} from "../../src/preview/previewState";
import { PREVIEW_ROUTE_REGISTRY } from "../../src/preview/routeRegistry";

test("parses canonical preview state from route and query", () => {
  const parsed = parsePreviewState(
    "/preview/tx?theme=bauhaus&frame=sidepanel&scenario=default&wallet=seedPhrase",
  );

  assert.deepEqual(parsed.state, {
    route: "tx",
    theme: "bauhaus",
    frame: "sidepanel",
    scenario: "default",
    wallet: "seedPhrase",
  });
  assert.deepEqual(parsed.warnings, []);
});

test("falls back safely and reports invalid state", () => {
  const parsed = parsePreviewState(
    "/preview/permission?theme=unknown&frame=wide&scenario=nope&wallet=bankr",
  );

  assert.equal(parsed.state.theme, "midnight");
  assert.equal(parsed.state.frame, "popup");
  assert.equal(parsed.state.scenario, "default");
  assert.equal(parsed.state.wallet, "bankr");
  assert.equal(parsed.warnings.length, 3);
});

test("formats reloadable canvas URLs", () => {
  assert.equal(
    previewStateUrl(
      {
        route: "settings",
        theme: "midnight",
        frame: "window",
        scenario: "root",
        wallet: "privateKey",
      },
      { canvas: true },
    ),
    "/preview/settings?theme=midnight&frame=window&scenario=root&wallet=privateKey&canvas=1",
  );
});

test("accepts the compact 320px reflow frame", () => {
  const parsed = parsePreviewState(
    "/preview/home?theme=midnight&frame=compact&scenario=default&wallet=bankr",
  );
  assert.equal(parsed.state.frame, "compact");
  assert.deepEqual(parsed.warnings, []);
});

test("keeps view-only signing fixtures separate from the three signer types", () => {
  const signing = parsePreviewState(
    "/preview/tx?theme=midnight&frame=popup&scenario=default&wallet=viewOnly",
  );
  assert.equal(signing.state.wallet, "viewOnly");
  assert.deepEqual(signing.warnings, []);

  const nonSigning = parsePreviewState(
    "/preview/settings?theme=midnight&frame=popup&scenario=root&wallet=viewOnly",
  );
  assert.equal(nonSigning.state.wallet, "bankr");
  assert.equal(nonSigning.warnings.length, 1);

  const permission = parsePreviewState(
    "/preview/permission?theme=midnight&frame=popup&scenario=default&wallet=viewOnly",
  );
  assert.equal(permission.state.wallet, "viewOnly");
  assert.deepEqual(permission.warnings, []);
});

test("every documented core scenario is accepted as reload-stable URL state", () => {
  const expected: Record<string, readonly string[]> = {
    home: ["default", "portfolio-loading", "portfolio-empty", "portfolio-error", "private", "stress"],
    unlock: ["pending-requests", "empty", "invalid-password", "submitting", "success", "biometric-configured"],
    tx: ["default", "loading", "simulation-error", "malformed-disabled", "stress", "impersonator-disabled"],
    signature: ["personal-sign", "typed-data-long", "siwe-blocked", "submitting", "impersonator-disabled"],
    portfolio: ["populated", "loading", "empty", "error", "stress", "activity-selected"],
    swap: ["default", "portfolio-loading", "portfolio-error", "quoted", "bridge-quoted", "disabled"],
    shield: ["default", "pending-eligibility", "unshield", "unshield-pending", "send"],
    "swap-picker": ["sell", "buy", "chains", "search", "loading", "empty", "missing-logo", "stress"],
    batch: ["default", "loading", "simulation-error", "malformed-disabled", "unsafe-self-call", "stress", "impersonator-disabled"],
    "cross-batch": ["default", "loading", "error", "stress", "impersonator-disabled"],
    permission: ["default", "metadata-loading", "metadata-unverified", "draft-invalid", "submitting", "advanced-stress"],
  };

  for (const [route, scenarios] of Object.entries(expected)) {
    assert.deepEqual(PREVIEW_ROUTE_REGISTRY[route as keyof typeof PREVIEW_ROUTE_REGISTRY].scenarios, scenarios);
    for (const scenario of scenarios) {
      const wallet = route === "permission" ? "privateKey" : "bankr";
      const parsed = parsePreviewState(
        `/preview/${route}?theme=midnight&frame=popup&scenario=${scenario}&wallet=${wallet}`,
      );
      assert.equal(parsed.state.scenario, scenario);
      assert.deepEqual(parsed.warnings, []);
    }
  }
});
