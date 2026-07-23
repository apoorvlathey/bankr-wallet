import { useCallback, useRef } from "react";
import {
  isPortfolioPerformanceDebugEnabled,
  logPortfolioPerformance,
  portfolioPerformanceNow,
} from "@/components/Portfolio/performanceDebug";

interface HoverMetrics {
  startedAt: number;
  lastEventAt: number;
  eventCount: number;
  indexUpdateCount: number;
  slowIntervalCount: number;
  maxIntervalMs: number;
}

export function usePortfolioChartHoverMetrics(snapshotCount: number) {
  const enabledRef = useRef(isPortfolioPerformanceDebugEnabled());
  const metricsRef = useRef<HoverMetrics | null>(null);

  const recordPointerEvent = useCallback(() => {
    if (!enabledRef.current) return;
    const now = portfolioPerformanceNow();
    const metrics = metricsRef.current;
    if (!metrics) {
      metricsRef.current = {
        startedAt: now,
        lastEventAt: now,
        eventCount: 1,
        indexUpdateCount: 0,
        slowIntervalCount: 0,
        maxIntervalMs: 0,
      };
      return;
    }
    const intervalMs = now - metrics.lastEventAt;
    metrics.lastEventAt = now;
    metrics.eventCount += 1;
    metrics.maxIntervalMs = Math.max(metrics.maxIntervalMs, intervalMs);
    if (intervalMs > 20) metrics.slowIntervalCount += 1;
  }, []);

  const recordIndexUpdate = useCallback(() => {
    if (metricsRef.current) metricsRef.current.indexUpdateCount += 1;
  }, []);

  const finishHoverSession = useCallback(() => {
    const metrics = metricsRef.current;
    if (!metrics) return;
    logPortfolioPerformance("chart-hover-session", {
      snapshotCount,
      eventCount: metrics.eventCount,
      indexUpdateCount: metrics.indexUpdateCount,
      slowIntervalCount: metrics.slowIntervalCount,
      maxIntervalMs: Number(metrics.maxIntervalMs.toFixed(2)),
      durationMs: Number(
        (portfolioPerformanceNow() - metrics.startedAt).toFixed(2),
      ),
    });
    metricsRef.current = null;
  }, [snapshotCount]);

  return { recordPointerEvent, recordIndexUpdate, finishHoverSession };
}
