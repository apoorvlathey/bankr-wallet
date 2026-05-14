"use client";

import { useState, useEffect, useCallback } from "react";

export type WithdrawalStatus =
  | "waiting-to-prove"
  | "ready-to-prove"
  | "waiting-to-finalize"
  | "ready-to-finalize"
  | "finalized";

export interface BridgeHistoryEntry {
  txHash: `0x${string}`;
  addedAt: number;
  txTimestamp?: number; // unix ms from the onchain block timestamp
  lastStatus: WithdrawalStatus | null;
  lastCheckedAt: number | null;
  tokenSymbol?: string;
  amount?: string;
  /** Estimated seconds remaining for the current waiting step */
  estimateSeconds?: number | null;
  /** Unix ms timestamp when the wait is expected to end */
  estimateTimestamp?: number | null;
  done: boolean;
}

const STORAGE_KEY = "@wchan/bridge-history";

function loadEntries(): BridgeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BridgeHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function useBridgeHistory() {
  const [entries, setEntries] = useState<BridgeHistoryEntry[]>(loadEntries);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // ignore
    }
  }, [entries]);

  const addEntry = useCallback((txHash: `0x${string}`) => {
    setEntries((prev) => {
      if (prev.some((e) => e.txHash.toLowerCase() === txHash.toLowerCase()))
        return prev;
      return [
        {
          txHash,
          addedAt: Date.now(),
          lastStatus: null,
          lastCheckedAt: null,
          done: false,
        },
        ...prev,
      ];
    });
  }, []);

  const updateEntry = useCallback(
    (txHash: string, partial: Partial<BridgeHistoryEntry>) => {
      setEntries((prev) =>
        prev.map((e) =>
          e.txHash.toLowerCase() === txHash.toLowerCase()
            ? { ...e, ...partial }
            : e
        )
      );
    },
    []
  );

  const removeEntry = useCallback((txHash: string) => {
    setEntries((prev) =>
      prev.filter((e) => e.txHash.toLowerCase() !== txHash.toLowerCase())
    );
  }, []);

  const markDone = useCallback((txHash: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.txHash.toLowerCase() === txHash.toLowerCase()
          ? { ...e, done: true, lastStatus: "finalized" }
          : e
      )
    );
  }, []);

  const hasActionable = entries.some(
    (e) =>
      e.lastStatus === "ready-to-prove" ||
      e.lastStatus === "ready-to-finalize"
  );

  return { entries, hasActionable, addEntry, updateEntry, removeEntry, markDone };
}
