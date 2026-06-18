import type {
  BungeeManualRoute,
  BungeeQuoteResponse,
} from "@walletchan/shared/bungee";

export type ExecutableBridgeRoute = BungeeManualRoute;
export type ExecutableBridgeRouteSource = "tx";

export interface ExecutableBridgeRouteSelection {
  route: ExecutableBridgeRoute;
  source: ExecutableBridgeRouteSource;
}

/**
 * Socket Swap V3 returns executable tx routes in result.manualRoutes[0] via
 * our backend adapter. The legacy auto/submit flow is intentionally ignored.
 */
export function getExecutableBridgeRouteSelection(
  quote: BungeeQuoteResponse | null | undefined,
): ExecutableBridgeRouteSelection | null {
  const manualRoute = quote?.result?.manualRoutes?.[0];
  if (manualRoute) {
    return { route: manualRoute, source: "tx" };
  }

  return null;
}

export function getExecutableBridgeRoute(
  quote: BungeeQuoteResponse | null | undefined,
): ExecutableBridgeRoute | null {
  return getExecutableBridgeRouteSelection(quote)?.route ?? null;
}
