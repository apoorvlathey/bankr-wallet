import { useEffect, useMemo } from "react";

import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { getPrivacyShieldActivitySyncPlan } from "./privacyShieldActivityModel";

/** Keeps Shield rows current even when the dedicated Shield screen is closed. */
export function usePrivacyShieldActivitySync(
  history: readonly CompletedTransaction[],
): void {
  const plan = useMemo(
    () => getPrivacyShieldActivitySyncPlan(history),
    [history],
  );

  useEffect(() => {
    if (!plan.shouldSync) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = async () => {
      try {
        await chrome.runtime.sendMessage({ type: "privacySyncShield" });
      } catch {
        // Keep the existing row snapshot; the next scheduled pass can retry.
      }
      if (!cancelled && plan.delay !== null) {
        timer = setTimeout(() => void sync(), plan.delay);
      }
    };

    void sync();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [plan.delay, plan.key, plan.shouldSync]);
}
