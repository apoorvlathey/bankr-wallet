export function logProviderError(
  method: string,
  message: string | undefined | null,
  code?: number,
  details?: unknown,
): void {
  if (code === 4001) return;
  const suffix = code !== undefined ? ` (code: ${code})` : "";
  const header = `[WalletChan] ${method} failed: ${message ?? "Unknown error"}${suffix}`;
  if (details !== undefined) console.warn(header, details);
  else console.warn(header);
}
