import { sanitizeUntrustedImageUrl } from "@/lib/remoteImagePolicy";
import { getDappPermissions } from "../requests/dappPermissionStorage";

const MAX_BROWSER_CONNECTED_DAPPS = 24;
const MAX_SITE_TITLE_CHARS = 120;

export interface BrowserConnectedDapp {
  origin: string;
  hostname: string;
  title?: string;
  favicon?: string;
  lastConnectedAt: number;
}

function browserConnectedDapp(value: unknown): BrowserConnectedDapp | null {
  if (!value || typeof value !== "object") return null;
  const permission = value as Record<string, unknown>;
  if (typeof permission.origin !== "string") return null;

  let url: URL;
  try {
    url = new URL(permission.origin);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.origin.toLowerCase() !== permission.origin.toLowerCase()
  ) {
    return null;
  }

  const lastConnectedAt = Number(permission.lastConnectedAt);
  if (!Number.isFinite(lastConnectedAt) || lastConnectedAt < 0) return null;

  const title =
    typeof permission.title === "string"
      ? permission.title.trim().slice(0, MAX_SITE_TITLE_CHARS) || undefined
      : undefined;
  const favicon = sanitizeUntrustedImageUrl(permission.favicon) ?? undefined;

  return {
    origin: url.origin,
    hostname: url.hostname.toLowerCase(),
    ...(title ? { title } : {}),
    ...(favicon ? { favicon } : {}),
    lastConnectedAt,
  };
}

/** Public display projection for the top-level WalletChan browser page. */
export async function listBrowserConnectedDapps(): Promise<BrowserConnectedDapp[]> {
  const permissions = await getDappPermissions();
  return Object.values(permissions)
    .map(browserConnectedDapp)
    .filter((dapp): dapp is BrowserConnectedDapp => dapp !== null)
    .sort((left, right) => right.lastConnectedAt - left.lastConnectedAt)
    .slice(0, MAX_BROWSER_CONNECTED_DAPPS);
}
