export const MAIN_DOMAIN = "walletchan.com";
export const MAIN_SITE = `https://${MAIN_DOMAIN}`;

/**
 * Single source of truth for subdomain ↔ route mapping.
 * To add a new subdomain: add one entry here, then update next.config.js rewrites + Vercel domains.
 */
export const SUBDOMAIN_ROUTES = [
  { path: "/os", subdomain: "os.walletchan.com" },
  { path: "/stake", subdomain: "stake.walletchan.com" },
  { path: "/migrate", subdomain: "migrate.walletchan.com" },
  { path: "/compare", subdomain: "compare.walletchan.com" },
  { path: "/mainnet", subdomain: "mainnet.walletchan.com" },
  { path: "/admin", subdomain: "admin.walletchan.com" },
] as const;

export type SubdomainRoute = (typeof SUBDOMAIN_ROUTES)[number]["path"];

/** Is the hostname localhost or 127.0.0.1? */
export function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Is the hostname a known production subdomain? */
export function isOnSubdomain(hostname: string): boolean {
  return SUBDOMAIN_ROUTES.some((r) => r.subdomain === hostname);
}

/** If on a subdomain, returns the matching route path (e.g. "/os"). Null otherwise. */
export function getCurrentSubdomainRoute(
  hostname: string
): SubdomainRoute | null {
  const entry = SUBDOMAIN_ROUTES.find((r) => r.subdomain === hostname);
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
  const entry = SUBDOMAIN_ROUTES.find((r) => r.path === route);
  if (entry && entry.subdomain === hostname) return "";
  return route;
}

/**
 * Resolve an internal path to the correct href for the current hostname context.
 *
 * - Localhost → always relative paths
 * - On a subdomain → own route="/", other subdomain routes=full URL, anchor/home=MAIN_SITE
 * - Main site → subdomain routes become full subdomain URLs
 */
export function resolveHref(
  targetPath: string,
  hostname: string,
  currentPathname: string
): string {
  const local = isLocalhost(hostname);
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
    // Linking to another subdomain route → full URL
    if (targetEntry) {
      const suffix = targetPath.slice(targetEntry.path.length);
      return `https://${targetEntry.subdomain}${suffix || "/"}`;
    }
    // Home link → main site
    if (targetPath === "/") return MAIN_SITE;
    // Anchor links → main site
    if (targetPath.startsWith("#")) return `${MAIN_SITE}/${targetPath}`;
    // Anything else → main site + path
    return `${MAIN_SITE}${targetPath}`;
  }

  // --- Main site (production, not a subdomain) ---
  if (targetEntry) {
    const suffix = targetPath.slice(targetEntry.path.length);
    return `https://${targetEntry.subdomain}${suffix || "/"}`;
  }
  // Anchor links on sub-pages
  if (currentPathname !== "/" && targetPath.startsWith("#")) {
    return `${MAIN_SITE}/${targetPath}`;
  }
  return targetPath;
}
