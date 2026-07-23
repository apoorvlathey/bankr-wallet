import { useEffect, useRef, useState } from "react";
import { getSnapshots } from "@/chrome/portfolio/snapshotStorage";
import {
  logPortfolioPerformance,
  portfolioPerformanceNow,
} from "@/components/Portfolio/performanceDebug";

export interface PortfolioChartSnapshot {
  timestamp: number;
  totalValueUsd: number;
}

const EMPTY_SNAPSHOTS: PortfolioChartSnapshot[] = [];

interface PortfolioChartSnapshotOptions {
  address: string;
  suppliedSnapshots?: ReadonlyArray<PortfolioChartSnapshot>;
  refreshTrigger: number;
}

export function usePortfolioChartSnapshots({
  address,
  suppliedSnapshots,
  refreshTrigger,
}: PortfolioChartSnapshotOptions): {
  snapshots: ReadonlyArray<PortfolioChartSnapshot>;
  loading: boolean;
} {
  const [loadedSnapshots, setLoadedSnapshots] = useState<
    PortfolioChartSnapshot[]
  >(() => (suppliedSnapshots ? [...suppliedSnapshots] : []));
  const [snapshotAddress, setSnapshotAddress] = useState(address);
  const [loading, setLoading] = useState(suppliedSnapshots === undefined);
  const resolvedAddressRef = useRef<string | null>(
    suppliedSnapshots ? address : null,
  );

  useEffect(() => {
    if (suppliedSnapshots) {
      setLoadedSnapshots([...suppliedSnapshots]);
      setSnapshotAddress(address);
      resolvedAddressRef.current = address;
      setLoading(false);
      return;
    }
    let cancelled = false;
    const showedSkeleton = resolvedAddressRef.current !== address;
    const startedAt = portfolioPerformanceNow();
    if (showedSkeleton) setLoading(true);
    logPortfolioPerformance("chart-snapshot-load-start", {
      address,
      refreshTrigger,
      showedSkeleton,
    });
    void getSnapshots(address)
      .then((snapshots) => {
        if (cancelled) return;
        setLoadedSnapshots(snapshots);
        setSnapshotAddress(address);
        resolvedAddressRef.current = address;
        setLoading(false);
        logPortfolioPerformance("chart-snapshot-load-complete", {
          address,
          refreshTrigger,
          snapshotCount: snapshots.length,
          showedSkeleton,
          durationMs: Number(
            (portfolioPerformanceNow() - startedAt).toFixed(2),
          ),
        });
      })
      .catch(() => {
        // Snapshot history is optional. Preserve an already-rendered chart on
        // refresh failure and keep a different/new account chart-free.
        if (cancelled) return;
        resolvedAddressRef.current = address;
        setLoading(false);
        logPortfolioPerformance("chart-snapshot-load-failed", {
          address,
          refreshTrigger,
          showedSkeleton,
          durationMs: Number(
            (portfolioPerformanceNow() - startedAt).toFixed(2),
          ),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [address, refreshTrigger, suppliedSnapshots]);

  // Same-account refreshes retain the previous series. Account changes never
  // show another address's snapshots while the new history is being resolved.
  const snapshots =
    snapshotAddress === address ? loadedSnapshots : EMPTY_SNAPSHOTS;
  const isResolvingNewAddress =
    suppliedSnapshots === undefined && resolvedAddressRef.current !== address;

  return {
    snapshots,
    loading: loading || isResolvingNewAddress,
  };
}
