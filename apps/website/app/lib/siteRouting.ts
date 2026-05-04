/**
 * Known top-level domains the site is served from. The first entry is the
 * canonical/primary TLD (used as fallback when current hostname is unknown,
 * e.g. on SSR before window is available).
 */
export const KNOWN_TLDS = ["walletchan.com", "walletchan.xyz"] as const;
export type KnownTld = (typeof KNOWN_TLDS)[number];

export const PRIMARY_TLD: KnownTld = "walletchan.com";

/**
 * Single source of truth for subdomain ↔ route mapping.
 * `slug` is the leftmost label (e.g. "os" → "os.walletchan.com" or "os.walletchan.xyz").
 * To add a new subdomain: add one entry here, then update next.config.js rewrites + Vercel domains for every TLD in KNOWN_TLDS.
 */
export const SUBDOMAIN_ROUTES = [
  { path: "/os", slug: "os" },
  { path: "/stake", slug: "stake" },
  { path: "/migrate", slug: "migrate" },
  { path: "/compare", slug: "compare" },
  { path: "/mainnet", slug: "mainnet" },
  { path: "/admin", slug: "admin" },
  { path: "/test", slug: "test" },
] as const;

export type SubdomainRoute = (typeof SUBDOMAIN_ROUTES)[number]["path"];

/** Returns the matched TLD for the given hostname, or null if not a known TLD. */
export function getTld(hostname: string): KnownTld | null {
  for (const tld of KNOWN_TLDS) {
    if (hostname === tld || hostname.endsWith(`.${tld}`)) return tld;
  }
  return null;
}

/** TLD-aware "main site" URL — preserves the visitor's current TLD context. */
export function getMainSite(hostname: string): string {
  return `https://${getTld(hostname) ?? PRIMARY_TLD}`;
}

/** Is the hostname localhost or 127.0.0.1? */
export function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Is the hostname a known production subdomain (under any known TLD)? */
export function isOnSubdomain(hostname: string): boolean {
  const tld = getTld(hostname);
  if (!tld) return false;
  return SUBDOMAIN_ROUTES.some((r) => hostname === `${r.slug}.${tld}`);
}

/** True if hostname matches `<slug>.<knownTld>` for the given slug. */
export function hostnameMatchesSlug(hostname: string, slug: string): boolean {
  const tld = getTld(hostname);
  return !!tld && hostname === `${slug}.${tld}`;
}

/** If on a subdomain, returns the matching route path (e.g. "/os"). Null otherwise. */
export function getCurrentSubdomainRoute(
  hostname: string
): SubdomainRoute | null {
  const tld = getTld(hostname);
  if (!tld) return null;
  const entry = SUBDOMAIN_ROUTES.find(
    (r) => hostname === `${r.slug}.${tld}`
  );
  return entry ? entry.path : null;
}

/**
 * Get the base path for a given subdomain route on the current host.
 * On the subdomain itself → "" (root-relative).
 * On localhost or main site → "/os" etc. (the normal path prefix).
 */
export function getBasePath(
  hostname: string,
  route: SubdomainRoute
): string {
  const tld = getTld(hostname);
  const entry = SUBDOMAIN_ROUTES.find((r) => r.path === route);
  if (entry && tld && hostname === `${entry.slug}.${tld}`) return "";
  return route;
}

/**
 * Resolve an internal path to the correct href for the current hostname context.
 *
 * - Localhost → always relative paths
 * - On a subdomain → own route="/", other subdomain routes=full URL (preserving TLD), anchor/home=main site (current TLD)
 * - Main site → subdomain routes become full subdomain URLs (preserving TLD)
 */
export function resolveHref(
  targetPath: string,
  hostname: string,
  currentPathname: string
): string {
  const local = isLocalhost(hostname);
  const tld = getTld(hostname) ?? PRIMARY_TLD;
  const mainSite = `https://${tld}`;
  const currentRoute = getCurrentSubdomainRoute(hostname);
  const targetEntry = SUBDOMAIN_ROUTES.find(
    (r) => targetPath === r.path || targetPath.startsWith(r.path + "/")
  );

  // --- Localhost: always relative paths ---
  if (local) {
    if (currentPathname !== "/" && targetPath.startsWith("#")) {
      return `/${targetPath}`;
    }
    return targetPath;
  }

  // --- On a subdomain ---
  if (currentRoute) {
    // Linking to own route → root
    if (targetPath === currentRoute) return "/";
    // Linking to own sub-path → strip prefix
    if (targetPath.startsWith(currentRoute + "/")) {
      return targetPath.slice(currentRoute.length);
    }
    // Linking to another subdomain route → full URL (preserving current TLD)
    if (targetEntry) {
      const suffix = targetPath.slice(targetEntry.path.length);
      return `https://${targetEntry.slug}.${tld}${suffix || "/"}`;
    }
    // Home link → main site (current TLD)
    if (targetPath === "/") return mainSite;
    // Anchor links → main site (current TLD)
    if (targetPath.startsWith("#")) return `${mainSite}/${targetPath}`;
    // Anything else → main site + path (current TLD)
    return `${mainSite}${targetPath}`;
  }

  // --- Main site (production, not a subdomain) ---
  if (targetEntry) {
    const suffix = targetPath.slice(targetEntry.path.length);
    return `https://${targetEntry.slug}.${tld}${suffix || "/"}`;
  }
  // Anchor links on sub-pages
  if (currentPathname !== "/" && targetPath.startsWith("#")) {
    return `${mainSite}/${targetPath}`;
  }
  return targetPath;
}
