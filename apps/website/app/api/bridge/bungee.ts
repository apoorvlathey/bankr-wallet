/** Shared upstream Socket Swap V3 config used by every /api/bridge/* route. */

function normalizeSocketApiUrl(url: string): string {
  if (url.includes("dedicated-backend.bungee.exchange")) {
    return "https://dedicated-backend.socket.tech";
  }
  if (url.includes("public-backend.bungee.exchange")) {
    return "https://public-backend.socket.tech";
  }
  return url.replace(/\/+$/, "");
}

export const BUNGEE_API_URL = normalizeSocketApiUrl(
  process.env.SOCKET_API_URL ??
    process.env.BUNGEE_API_URL ??
    "https://public-backend.socket.tech",
);

const BUNGEE_API_KEY = process.env.BUNGEE_API_KEY ?? "";
const BUNGEE_AFFILIATE_ID = process.env.BUNGEE_AFFILIATE_ID ?? "";

/** Returns headers to send to Socket. Omits keys that aren't configured so
 *  the public sandbox (no key) still works while production gets both. */
export function bungeeHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (BUNGEE_API_KEY) h["x-api-key"] = BUNGEE_API_KEY;
  if (BUNGEE_AFFILIATE_ID) h["affiliate"] = BUNGEE_AFFILIATE_ID;
  return h;
}
