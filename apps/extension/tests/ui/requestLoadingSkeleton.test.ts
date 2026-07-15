import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../../src/App.tsx", import.meta.url),
  "utf8",
);
const skeletonSource = await readFile(
  new URL(
    "../../src/app/screens/InitialRequestLoadingScreen.tsx",
    import.meta.url,
  ),
  "utf8",
);
const transitionSource = await readFile(
  new URL("../../src/app/AppBootstrapTransition.tsx", import.meta.url),
  "utf8",
);

test("startup uses the request skeleton instead of the generic spinner", () => {
  assert.match(appSource, /<AppBootstrapTransition/);
  assert.match(appSource, /showRequestSkeleton={isApprovalRequestLoading}/);
  assert.match(transitionSource, /<InitialRequestLoadingScreen \/>/);
  assert.match(transitionSource, /!showRequestSkeleton && isLoading/);
  assert.doesNotMatch(appSource, /Loading WalletChan…/);
});

test("request skeleton mirrors the shared confirmation regions", () => {
  assert.match(skeletonSource, /<ConfirmationScreen/);
  assert.match(skeletonSource, /financialImpact=/);
  assert.match(skeletonSource, /context=/);
  assert.match(skeletonSource, /advancedDetails=/);
  assert.match(skeletonSource, /actionSummary=/);
  assert.match(skeletonSource, /rejectAction={<ActionSkeleton tone={tone} \/>}/);
  assert.match(skeletonSource, /confirmAction={<ActionSkeleton tone={tone} \/>}/);
});

test("request skeleton exposes one accessible loading status", () => {
  assert.match(skeletonSource, /role="status"/);
  assert.match(skeletonSource, /aria-busy="true"/);
  assert.match(skeletonSource, /aria-label="Loading request"/);
  assert.match(
    skeletonSource,
    /<VisuallyHidden>Loading request<\/VisuallyHidden>/,
  );
  assert.match(skeletonSource, /aria-hidden="true"/);
});

test("request skeleton uses a subtle Midnight-only surface ramp", () => {
  assert.match(skeletonSource, /themeId === "midnight"/);
  assert.match(skeletonSource, /startColor: "surface\.raised"/);
  assert.match(skeletonSource, /endColor: "surface\.raisedHover"/);
  assert.match(skeletonSource, /prefersReducedMotion \? "none" : undefined/);
});

test("resolved requests crossfade quickly from the mounted skeleton", () => {
  assert.match(transitionSource, /REQUEST_BOOTSTRAP_TRANSITION_MS = 140/);
  assert.match(transitionSource, /opacity={isLoading \? 1 : 0}/);
  assert.match(
    transitionSource,
    /opacity={isRequestTransition && isLoading \? 0 : 1}/,
  );
  assert.match(transitionSource, /prefersReducedMotion \? 0/);
});

test("matching approval requests paint before secondary app hydration", () => {
  const hintedRouteIndex = appSource.indexOf("if (hintedApprovalRoute)");
  const releaseIndex = appSource.indexOf(
    "setIsLoading(false);",
    hintedRouteIndex,
  );
  const deferredHydrationIndex = appSource.indexOf(
    "await Promise.all([",
    hintedRouteIndex,
  );

  assert.ok(hintedRouteIndex >= 0);
  assert.ok(releaseIndex > hintedRouteIndex);
  assert.ok(deferredHydrationIndex > releaseIndex);
  assert.ok(
    appSource.indexOf("preloadApprovalRequestScreen") < hintedRouteIndex,
  );
});
