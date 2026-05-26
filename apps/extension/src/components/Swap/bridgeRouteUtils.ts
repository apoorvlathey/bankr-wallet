import type {
  BungeeAutoRoute,
  BungeeManualRoute,
  BungeeQuoteResponse,
} from "@walletchan/shared/bungee";

export type ExecutableBridgeRoute = BungeeManualRoute | BungeeAutoRoute;
export type ExecutableBridgeRouteSource = "manual" | "auto-tx";

export interface ExecutableBridgeRouteSelection {
  route: ExecutableBridgeRoute;
  source: ExecutableBridgeRouteSource;
}

/**
 * Prefer manual routes because build-tx can refresh the executable calldata.
 * Some Bungee pairs only return an autoRoute with txData and no typed-data
 * signature; that is still directly executable by the extension.
 */
export function getExecutableBridgeRouteSelection(
  quote: BungeeQuoteResponse | null | undefined,
): ExecutableBridgeRouteSelection | null {
  const manualRoute = quote?.result?.manualRoutes?.[0];
  if (manualRoute) {
    return { route: manualRoute, source: "manual" };
  }

  const autoRoute = quote?.result?.autoRoute;
  if (autoRoute?.txData) {
    return { route: autoRoute, source: "auto-tx" };
  }

  return null;
}

export function getExecutableBridgeRoute(
  quote: BungeeQuoteResponse | null | undefined,
): ExecutableBridgeRoute | null {
  return getExecutableBridgeRouteSelection(quote)?.route ?? null;
}
