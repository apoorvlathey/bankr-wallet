import { sanitizeCustomExplorerUrl } from "@/lib/externalNavigation";

export function cleanNetworkHttpUrl(
  value: unknown,
  field: "RPC" | "Explorer",
  required: boolean,
): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    if (required) throw new Error(`${field} URL is required.`);
    return undefined;
  }
  if (trimmed.length > 2_048) throw new Error(`${field} URL is too long.`);
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password ||
      (field === "Explorer" && !sanitizeCustomExplorerUrl(trimmed))
    ) {
      throw new Error();
    }
  } catch {
    if (field === "Explorer") {
      throw new Error(
        "Explorer URL must use public HTTPS (or HTTP(S) localhost) without embedded credentials.",
      );
    }
    throw new Error(
      `${field} URL must use HTTP or HTTPS without embedded credentials.`,
    );
  }
  return trimmed.replace(/\/+$/, "");
}
