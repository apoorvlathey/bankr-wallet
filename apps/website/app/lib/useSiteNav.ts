"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  isLocalhost as _isLocalhost,
  isOnSubdomain as _isOnSubdomain,
  getCurrentSubdomainRoute,
  getBasePath,
  getMainSite,
  resolveHref,
  type SubdomainRoute,
} from "./siteRouting";

export function useSiteNav() {
  const pathname = usePathname();
  const [hostname, setHostname] = useState("");

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  const isLocal = useMemo(() => _isLocalhost(hostname), [hostname]);
  const onSubdomain = useMemo(() => _isOnSubdomain(hostname), [hostname]);
  const currentRoute = useMemo(
    () => getCurrentSubdomainRoute(hostname),
    [hostname]
  );

  /** Resolve any internal path to the correct href for the current context. */
  const href = useCallback(
    (targetPath: string) => resolveHref(targetPath, hostname, pathname),
    [hostname, pathname]
  );

  /**
   * Get the base path for a given subdomain route on the current host.
   * e.g. on os.walletchan.com, getRouteBasePath("/os") returns "".
   */
  const getRouteBasePath = useCallback(
    (route: SubdomainRoute) => getBasePath(hostname, route),
    [hostname]
  );

  /** Logo / home link: main site URL on subdomains (preserving TLD), "/" otherwise. */
  const homeHref = onSubdomain ? getMainSite(hostname) : "/";

  return {
    /** Resolve an internal path to the correct href */
    href,
    /** Logo / home link */
    homeHref,
    /** Whether currently on localhost */
    isLocalhost: isLocal,
    /** Whether currently on a known subdomain */
    isOnSubdomain: onSubdomain,
    /** The current subdomain route (e.g. "/os") or null */
    currentRoute,
    /** Get base path for a subdomain route on the current host */
    getRouteBasePath,
    /** Whether on a specific page (checks both pathname and subdomain) */
    isOnPage: useCallback(
      (route: SubdomainRoute) =>
        pathname === route || currentRoute === route,
      [pathname, currentRoute]
    ),
  };
}
