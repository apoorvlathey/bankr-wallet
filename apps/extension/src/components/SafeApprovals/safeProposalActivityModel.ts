function hostname(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Preserve a real request URL for the shared transaction identity surface. */
export function getSafeProposalRequestOrigin(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "WalletChan";
  const raw = value.trim();

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const key of ["url", "origin"]) {
        const candidate = parsed[key];
        if (typeof candidate === "string" && hostname(candidate)) {
          return candidate;
        }
      }
      const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
      return name || "Safe app";
    } catch {
      return "Safe app";
    }
  }

  return raw;
}

/** Safe's service sometimes serializes origin metadata as JSON text. */
export function formatSafeProposalOrigin(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "WalletChan";
  const raw = value.trim();

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
      if (name) return name;
      for (const key of ["url", "origin"]) {
        const candidate = parsed[key];
        if (typeof candidate !== "string") continue;
        const resolved = hostname(candidate);
        if (resolved) return resolved;
      }
      return "Safe app";
    } catch {
      return "Safe app";
    }
  }

  return hostname(raw) ?? raw;
}
