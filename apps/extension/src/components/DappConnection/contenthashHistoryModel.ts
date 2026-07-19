export function formatContenthashUpdatedAt(
  updatedAt: number,
  now = Date.now(),
): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - updatedAt) / 1_000));
  if (elapsedSeconds < 60) return "just now";

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60],
    ["month", 30 * 24 * 60 * 60],
    ["day", 24 * 60 * 60],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const [unit, secondsPerUnit] =
    units.find(([, threshold]) => elapsedSeconds >= threshold) ?? units.at(-1)!;
  const value = Math.floor(elapsedSeconds / secondsPerUnit);
  return new Intl.RelativeTimeFormat("en", { numeric: "always" }).format(
    -value,
    unit,
  );
}

export type ContenthashHistoryState =
  | { status: "idle" | "loading" | "unavailable"; updatedAt: null }
  | { status: "found"; updatedAt: number };

export function contenthashHistoryLabel(
  state: ContenthashHistoryState,
  now = Date.now(),
): string | null {
  switch (state.status) {
    case "idle":
      return null;
    case "loading":
      return "IPFS Hash last updated: Checking…";
    case "unavailable":
      return "IPFS Hash last updated: Unavailable";
    case "found":
      return `IPFS Hash last updated: ${formatContenthashUpdatedAt(state.updatedAt, now)}`;
  }
}
