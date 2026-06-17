import routingConfig from "../../routing.config.json";

type RoutePath = `/${string}`;

type SiteRoute = {
  path: RoutePath;
  slug: string;
};

type RoutingConfig = {
  primaryHost: string;
  fallbackHost: string;
  subdomainBaseHosts: string[];
  pathBaseHosts: string[];
  redirectBaseHosts: string[];
  retiredSubdomainSlugs: string[];
  routes: SiteRoute[];
};

const config = routingConfig as RoutingConfig;

export const PRIMARY_HOST = config.primaryHost;
export const FALLBACK_HOST = config.fallbackHost;
export const SUBDOMAIN_BASE_HOSTS = config.subdomainBaseHosts as readonly string[];
export const PATH_BASE_HOSTS = config.pathBaseHosts as readonly string[];
export const REDIRECT_BASE_HOSTS = config.redirectBaseHosts as readonly string[];
export const SUBDOMAIN_ROUTES = config.routes as readonly SiteRoute[];
export const SITE_ROUTES = SUBDOMAIN_ROUTES;

export type SubdomainRoute = (typeof SUBDOMAIN_ROUTES)[number]["path"];
export type SiteRoutePath = SubdomainRoute;
export type HostMode =
  | "localhost"
  | "subdomain-base"
  | "subdomain-route"
  | "path-base"
  | "redirect-base"
  | "redirect-subdomain"
  | "unknown";

function stripPort(hostname: string): string {
  return hostname.toLowerCase().replace(/:\d+$/, "");
}

export function normalizeHostname(hostname: string): string {
  return stripPort(hostname.trim());
}

export function isLocalhost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function getRouteForPath(pathname: string): SiteRoute | null {
  return (
    SITE_ROUTES.find(
      (route) => pathname === route.path || pathname.startsWith(`${route.path}/`)
    ) ?? null
  );
}

export function getRouteForSlug(slug: string): SiteRoute | null {
  return SITE_ROUTES.find((route) => route.slug === slug) ?? null;
}

export function getHostMode(hostname: string): HostMode {
  const host = normalizeHostname(hostname);

  if (!host) return "unknown";
  if (isLocalhost(host)) return "localhost";
  if (SUBDOMAIN_BASE_HOSTS.includes(host)) return "subdomain-base";
  if (PATH_BASE_HOSTS.includes(host)) return "path-base";
  if (REDIRECT_BASE_HOSTS.includes(host)) return "redirect-base";

  for (const baseHost of SUBDOMAIN_BASE_HOSTS) {
    if (SITE_ROUTES.some((route) => host === `${route.slug}.${baseHost}`)) {
      return "subdomain-route";
    }
  }

  for (const baseHost of REDIRECT_BASE_HOSTS) {
    if (SITE_ROUTES.some((route) => host === `${route.slug}.${baseHost}`)) {
      return "redirect-subdomain";
    }
  }

  return "unknown";
}

export function isPathBasedHost(hostname: string): boolean {
  const mode = getHostMode(hostname);
  return mode === "localhost" || mode === "path-base";
}

export function isOnSubdomain(hostname: string): boolean {
  return getHostMode(hostname) === "subdomain-route";
}

export function hostnameMatchesSlug(hostname: string, slug: string): boolean {
  const host = normalizeHostname(hostname);
  return SUBDOMAIN_BASE_HOSTS.some((baseHost) => host === `${slug}.${baseHost}`);
}

export function getCurrentSubdomainRoute(
  hostname: string
): SubdomainRoute | null {
  const host = normalizeHostname(hostname);
  for (const baseHost of SUBDOMAIN_BASE_HOSTS) {
    const route = SITE_ROUTES.find((entry) => host === `${entry.slug}.${baseHost}`);
    if (route) return route.path;
  }
  return null;
}

export function getMainSite(hostname: string): string {
  const host = normalizeHostname(hostname);
  if (SUBDOMAIN_BASE_HOSTS.includes(host) || PATH_BASE_HOSTS.includes(host)) {
    return `https://${host}`;
  }

  for (const baseHost of SUBDOMAIN_BASE_HOSTS) {
    if (SITE_ROUTES.some((route) => host === `${route.slug}.${baseHost}`)) {
      return `https://${baseHost}`;
    }
  }

  return `https://${PRIMARY_HOST}`;
}

export function getBasePath(
  hostname: string,
  route: SubdomainRoute
): string {
  const currentRoute = getCurrentSubdomainRoute(hostname);
  return currentRoute === route ? "" : route;
}

export function getPathForRedirectHost(
  pathname: string,
  prefix: string | null | undefined
): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!prefix || prefix === "/") return normalizedPath;
  const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
  if (normalizedPath === "/") return normalizedPrefix;
  return `${normalizedPrefix}${normalizedPath}`;
}

export function getCanonicalUrl(pathname: string = "/"): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `https://${PRIMARY_HOST}${normalizedPath === "/" ? "" : normalizedPath}`;
}

export function getFallbackUrl(pathname: string = "/"): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `https://${FALLBACK_HOST}${normalizedPath === "/" ? "" : normalizedPath}`;
}

function withSuffix(base: string, suffix: string): string {
  return `${base}${suffix || "/"}`;
}

export function resolveHref(
  targetPath: string,
  hostname: string,
  currentPathname: string
): string {
  if (
    targetPath.startsWith("http://") ||
    targetPath.startsWith("https://") ||
    targetPath.startsWith("mailto:")
  ) {
    return targetPath;
  }

  const mode = getHostMode(hostname);
  const currentRoute = getCurrentSubdomainRoute(hostname);
  const targetRoute = getRouteForPath(targetPath);

  if (mode === "localhost" || mode === "path-base" || mode === "unknown") {
    if (currentPathname !== "/" && targetPath.startsWith("#")) {
      return `/${targetPath}`;
    }
    return targetPath;
  }

  if (currentRoute) {
    if (targetPath === currentRoute) return "/";
    if (targetPath.startsWith(`${currentRoute}/`)) {
      return targetPath.slice(currentRoute.length);
    }
    if (targetRoute) {
      const suffix = targetPath.slice(targetRoute.path.length);
      return withSuffix(
        `https://${targetRoute.slug}.${PRIMARY_HOST}`,
        suffix
      );
    }
    if (targetPath === "/") return getMainSite(hostname);
    if (targetPath.startsWith("#")) return `${getMainSite(hostname)}/${targetPath}`;
    return `${getMainSite(hostname)}${targetPath}`;
  }

  if (mode === "subdomain-base" && targetRoute) {
    const suffix = targetPath.slice(targetRoute.path.length);
    return withSuffix(`https://${targetRoute.slug}.${PRIMARY_HOST}`, suffix);
  }

  if (currentPathname !== "/" && targetPath.startsWith("#")) {
    return `${getMainSite(hostname)}/${targetPath}`;
  }

  return targetPath;
}

export function isOfficialWalletChanHostMention(value: string): boolean {
  const lower = value.toLowerCase();
  const hosts = [
    PRIMARY_HOST,
    FALLBACK_HOST,
    ...SUBDOMAIN_BASE_HOSTS,
    ...PATH_BASE_HOSTS,
    ...REDIRECT_BASE_HOSTS,
  ];
  return hosts.some((host) => lower.includes(host.toLowerCase()));
}
