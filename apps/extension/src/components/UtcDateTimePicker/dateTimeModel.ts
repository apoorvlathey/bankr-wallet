export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);

export type UtcParts = {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
};

export type UtcDateBoundaryDirection = "minimum" | "maximum";

export function getCalendarDayBoundaryState(
  day: Pick<UtcParts, "year" | "monthIndex" | "day">,
  boundarySeconds: number,
  direction: UtcDateBoundaryDirection,
): { isBoundary: boolean; isDisabled: boolean } {
  if (!Number.isFinite(boundarySeconds)) {
    return { isBoundary: false, isDisabled: false };
  }

  const boundary = toUtcParts(boundarySeconds);
  const dayTimestamp = Date.UTC(day.year, day.monthIndex, day.day);
  const boundaryTimestamp = Date.UTC(
    boundary.year,
    boundary.monthIndex,
    boundary.day,
  );
  const comparison = Math.sign(dayTimestamp - boundaryTimestamp);

  return {
    isBoundary: comparison === 0,
    isDisabled:
      direction === "minimum" ? comparison < 0 : comparison > 0,
  };
}

export function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function toUtcParts(seconds: number): UtcParts {
  const date = new Date(seconds * 1000);
  return {
    year: date.getUTCFullYear(),
    monthIndex: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

export function toUtcSeconds(parts: UtcParts): number {
  return Math.floor(Date.UTC(
    parts.year,
    parts.monthIndex,
    parts.day,
    parts.hour,
    parts.minute,
  ) / 1000);
}

export function formatUtcDisplay(seconds: number | null): string {
  if (seconds === null) return "Select date and time";
  const parts = toUtcParts(seconds);
  return `${SHORT_MONTHS[parts.monthIndex]} ${parts.day}, ${parts.year}, ${pad2(
    parts.hour,
  )}:${pad2(parts.minute)} UTC`;
}

export function visibleMonthFromSeconds(seconds: number | null): {
  year: number;
  monthIndex: number;
} {
  const parts = toUtcParts(seconds ?? Math.floor(Date.now() / 1000));
  return { year: parts.year, monthIndex: parts.monthIndex };
}

export function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
}

export function buildCalendarDays(year: number, monthIndex: number) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const mondayBasedOffset = (firstDay + 6) % 7;
  const gridStartDay = 1 - mondayBasedOffset;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, gridStartDay + index));
    return {
      year: date.getUTCFullYear(),
      monthIndex: date.getUTCMonth(),
      day: date.getUTCDate(),
      inVisibleMonth: date.getUTCMonth() === monthIndex,
    };
  });
}
