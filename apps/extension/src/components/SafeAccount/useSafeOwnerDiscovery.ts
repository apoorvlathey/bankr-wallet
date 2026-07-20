import { useRef, useState } from "react";
import type {
  SafeChainSnapshot,
} from "@/chrome/safe/types";
import type { SafeProbeFailure } from "@/chrome/safe/discovery";

const OWNER_DISCOVERY_BATCH_SIZE = 4;

export interface DiscoveredSafe {
  address: `0x${string}`;
  snapshots: SafeChainSnapshot[];
  verificationIds: string[];
  failures: SafeProbeFailure[];
  scannedChainIds: number[];
}

interface OwnerDiscoveryResponse {
  candidates?: Array<{
    address: `0x${string}`;
    snapshot: SafeChainSnapshot;
    verificationId: string;
  }>;
  failures?: SafeProbeFailure[];
  scannedChainIds?: number[];
  nextOffset?: number;
  totalChains?: number;
  complete?: boolean;
  success?: false;
  error?: string;
}

function runtimeMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

export function useSafeOwnerDiscovery() {
  const [discovered, setDiscovered] = useState<DiscoveredSafe[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    scanned: number;
    total: number;
  } | null>(null);
  const runRef = useRef(0);

  const discover = async (accountId: string | null) => {
    if (!accountId) {
      setError("Choose one account to search with");
      return;
    }

    const runId = ++runRef.current;
    setIsDiscovering(true);
    setIsComplete(false);
    setError(null);
    setProgress(null);
    setDiscovered([]);
    let offset = 0;
    let hasMore = true;
    const accumulatedFailures: SafeProbeFailure[] = [];
    const accumulatedScannedChainIds: number[] = [];

    try {
      const countResult = await runtimeMessage<OwnerDiscoveryResponse>({
        type: "findSafesByOwner",
        accountId,
        offset: 0,
        limit: 0,
        countOnly: true,
      });
      if (runId !== runRef.current) return;
      if (countResult.success === false) {
        throw new Error(countResult.error || "Safe discovery failed");
      }
      const totalChains = countResult.totalChains ?? 0;
      setProgress({ scanned: 0, total: totalChains });
      hasMore = totalChains > 0;

      while (hasMore) {
        const result = await runtimeMessage<OwnerDiscoveryResponse>({
          type: "findSafesByOwner",
          accountId,
          offset,
          limit: OWNER_DISCOVERY_BATCH_SIZE,
        });
        if (runId !== runRef.current) return;
        if (result.success === false) {
          throw new Error(result.error || "Safe discovery failed");
        }

        accumulatedFailures.push(...(result.failures || []));
        accumulatedScannedChainIds.push(...(result.scannedChainIds || []));
        setDiscovered((current) => {
          const grouped = new Map(
            current.map((candidate) => [candidate.address.toLowerCase(), candidate]),
          );
          for (const item of result.candidates || []) {
            const key = item.address.toLowerCase();
            const existing = grouped.get(key);
            const snapshots = existing?.snapshots || [];
            const verificationIds = existing?.verificationIds || [];
            grouped.set(key, {
              address: item.address,
              snapshots: snapshots.some(
                (snapshot) => snapshot.chainId === item.snapshot.chainId,
              )
                ? snapshots
                : [...snapshots, item.snapshot],
              verificationIds: verificationIds.includes(item.verificationId)
                ? verificationIds
                : [...verificationIds, item.verificationId],
              failures: [...accumulatedFailures],
              scannedChainIds: [...accumulatedScannedChainIds],
            });
          }
          return [...grouped.values()].map((candidate) => ({
            ...candidate,
            failures: [...accumulatedFailures],
            scannedChainIds: [...accumulatedScannedChainIds],
          }));
        });

        const nextOffset = result.nextOffset ?? accumulatedScannedChainIds.length;
        const totalChains = result.totalChains ?? nextOffset;
        setProgress({ scanned: nextOffset, total: totalChains });
        hasMore = !(result.complete ?? true);
        if (hasMore && nextOffset <= offset) {
          throw new Error("Safe discovery did not advance");
        }
        offset = nextOffset;
      }
    } catch (caught) {
      if (runId === runRef.current) {
        setError(caught instanceof Error ? caught.message : "Safe discovery failed");
      }
    } finally {
      if (runId === runRef.current) {
        setIsDiscovering(false);
        setIsComplete(true);
      }
    }
  };

  return {
    discover,
    discovered,
    error,
    isComplete,
    isDiscovering,
    progress,
  };
}
