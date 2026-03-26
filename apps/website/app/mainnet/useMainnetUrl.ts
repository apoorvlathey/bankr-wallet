"use client";

import { useCallback } from "react";
import { SUBDOMAIN_ROUTES } from "../lib/siteRouting";

const MAINNET_ROUTE = SUBDOMAIN_ROUTES.find((r) => r.path === "/mainnet")!;

/**
 * On mainnet.walletchan.com the /mainnet route is served at /.
 * Internal links need to drop the /mainnet prefix when on the subdomain.
 *
 * In production (Vercel), the subdomain rewrite handles routing, so we always
 * strip the prefix. This avoids SSR/hydration mismatches where the server
 * would render "/mainnet/claim" but the client expects "/claim".
 */
function isSubdomain(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  if (typeof window === "undefined") return false;
  return window.location.hostname === MAINNET_ROUTE.subdomain;
}

/** Convert a /mainnet/* path to the correct href for the current host. */
export function mainnetHref(path: string): string {
  if (!isSubdomain()) return path;
  // "/mainnet" -> "/", "/mainnet/claim?tx=0x..." -> "/claim?tx=0x..."
  const prefix = MAINNET_ROUTE.path;
  if (path === prefix) return "/";
  if (path.startsWith(prefix + "/")) return path.slice(prefix.length);
  return path;
}

export function useMainnetUrl() {
  return useCallback(mainnetHref, []);
}
