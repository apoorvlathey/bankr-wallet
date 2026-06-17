"use client";

import { useCallback } from "react";
import { resolveHref } from "../lib/siteRouting";

/** Convert a /mainnet/* path to the correct href for the current host. */
export function mainnetHref(path: string): string {
  if (typeof window === "undefined") return path;
  return resolveHref(path, window.location.hostname, window.location.pathname);
}

export function useMainnetUrl() {
  return useCallback(mainnetHref, []);
}
