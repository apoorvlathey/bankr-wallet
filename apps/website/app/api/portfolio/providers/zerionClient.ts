interface ZerionErrorResponse {
  errors?: Array<{ title?: string; detail?: string }>;
}

export const ZERION_API_BASE = "https://api.zerion.io/v1";

export function normalizeZerionNextUrl(
  next: string | null | undefined,
): string | null {
  if (!next || !next.startsWith(`${ZERION_API_BASE}/`)) return null;
  return next;
}

export async function fetchZerionJson<T>(
  url: string,
  apiKey: string,
  revalidate: number,
): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    },
    next: { revalidate },
  });

  if (!res.ok) {
    const detail = await readErrorDetail(res);
    throw new Error(`Zerion ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  return (await res.json()) as T;
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as ZerionErrorResponse;
    return (
      json.errors
        ?.map((err) => err.detail || err.title)
        .filter(Boolean)
        .join("; ") || ""
    );
  } catch {
    return "";
  }
}
