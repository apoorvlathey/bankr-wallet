import { isThemeId } from "@/theme";
import {
  PREVIEW_ROUTE_REGISTRY,
  isPreviewRoute,
} from "./routeRegistry";
import type {
  FrameMode,
  PreviewRoute,
  PreviewState,
  PreviewWalletType,
} from "./types";

const FRAME_MODES: readonly FrameMode[] = [
  "compact",
  "popup",
  "window",
  "sidepanel",
];
const WALLET_TYPES: readonly PreviewWalletType[] = [
  "bankr",
  "privateKey",
  "seedPhrase",
  "viewOnly",
];

export const DEFAULT_PREVIEW_STATE: PreviewState = {
  route: "all",
  theme: "midnight",
  frame: "popup",
  scenario: "default",
  wallet: "bankr",
};

export interface ParsedPreviewState {
  state: PreviewState;
  warnings: string[];
  canvas: boolean;
}

function routeFromPath(pathname: string): PreviewRoute {
  const slug = pathname.split("/").filter(Boolean).pop();
  return isPreviewRoute(slug) ? slug : "all";
}

export function parsePreviewState(input: string | URL): ParsedPreviewState {
  const url = typeof input === "string" ? new URL(input, "http://preview.local") : input;
  const warnings: string[] = [];
  const route = routeFromPath(url.pathname);
  const definition = route === "all" ? null : PREVIEW_ROUTE_REGISTRY[route];

  const requestedTheme = url.searchParams.get("theme");
  const theme = isThemeId(requestedTheme)
    ? requestedTheme
    : DEFAULT_PREVIEW_STATE.theme;
  if (requestedTheme && !isThemeId(requestedTheme)) {
    warnings.push(`Unknown theme: ${requestedTheme}`);
  }

  const requestedFrame = url.searchParams.get("frame");
  const frame = FRAME_MODES.includes(requestedFrame as FrameMode)
    ? (requestedFrame as FrameMode)
    : DEFAULT_PREVIEW_STATE.frame;
  if (requestedFrame && !FRAME_MODES.includes(requestedFrame as FrameMode)) {
    warnings.push(`Unknown frame: ${requestedFrame}`);
  }

  const requestedWallet = url.searchParams.get("wallet");
  let wallet = WALLET_TYPES.includes(requestedWallet as PreviewWalletType)
    ? (requestedWallet as PreviewWalletType)
    : DEFAULT_PREVIEW_STATE.wallet;
  if (requestedWallet && !WALLET_TYPES.includes(requestedWallet as PreviewWalletType)) {
    warnings.push(`Unknown wallet: ${requestedWallet}`);
  }
  if (definition && !definition.wallets.includes(wallet)) {
    warnings.push(`${wallet} is not supported by the ${route} preview`);
    wallet = definition.wallets[0];
  }

  const requestedScenario = url.searchParams.get("scenario");
  const defaultScenario = definition?.defaultScenario ?? DEFAULT_PREVIEW_STATE.scenario;
  const scenario =
    definition && requestedScenario && definition.scenarios.includes(requestedScenario)
      ? requestedScenario
      : defaultScenario;
  if (
    definition &&
    requestedScenario &&
    !definition.scenarios.includes(requestedScenario)
  ) {
    warnings.push(`Unknown ${route} scenario: ${requestedScenario}`);
  }

  return {
    state: { route, theme, frame, scenario, wallet },
    warnings,
    canvas: url.searchParams.get("canvas") === "1",
  };
}

export function previewStateUrl(
  state: PreviewState,
  options: { canvas?: boolean } = {},
): string {
  const params = new URLSearchParams({
    theme: state.theme,
    frame: state.frame,
    scenario: state.scenario,
    wallet: state.wallet,
  });
  if (options.canvas) params.set("canvas", "1");
  return `/preview/${state.route}?${params.toString()}`;
}
