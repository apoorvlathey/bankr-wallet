import type { ProfilerOnRenderCallback } from "react";

export const PORTFOLIO_PERFORMANCE_DEBUG_KEY =
  "walletchan:debug:portfolio-performance";

export function isPortfolioPerformanceDebugEnabled(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem(PORTFOLIO_PERFORMANCE_DEBUG_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function portfolioPerformanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function logPortfolioPerformance(
  event: string,
  details: Record<string, unknown>,
): void {
  if (!isPortfolioPerformanceDebugEnabled()) return;
  console.debug(`[WalletChan portfolio perf] ${event}`, details);
}

export function measurePortfolioPerformance<T>(
  event: string,
  details: Record<string, unknown>,
  work: () => T,
): T {
  if (!isPortfolioPerformanceDebugEnabled()) return work();
  const startedAt = portfolioPerformanceNow();
  const result = work();
  logPortfolioPerformance(event, {
    ...details,
    durationMs: Number(
      (portfolioPerformanceNow() - startedAt).toFixed(2),
    ),
  });
  return result;
}

export const logPortfolioProfiler: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  logPortfolioPerformance("react-commit", {
    id,
    phase,
    actualDurationMs: Number(actualDuration.toFixed(2)),
    baseDurationMs: Number(baseDuration.toFixed(2)),
    startTimeMs: Number(startTime.toFixed(2)),
    commitTimeMs: Number(commitTime.toFixed(2)),
  });
};
