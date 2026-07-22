import { useEffect, useState } from "react";
import type { SafeAccountRecord } from "@/chrome/safe/types";
import HomeQuickActions from "@/components/HomeQuickActions";

export function SafeQuickActions({
  onSend,
  onSwap,
  onMore,
  safeAccountId,
  chainId,
  hasConnectedApps = false,
}: {
  onSend: () => void;
  onSwap: () => void;
  onMore: () => void;
  safeAccountId: string;
  chainId: number;
  hasConnectedApps?: boolean;
}) {
  const [actionDisabledReason, setActionDisabledReason] = useState(
    "Checking Safe permissions",
  );

  useEffect(() => {
    let active = true;
    chrome.runtime.sendMessage({ type: "getSafeAccounts" }, (records: SafeAccountRecord[]) => {
      if (!active || chrome.runtime.lastError) return;
      const snapshot = records?.find((record) => record.accountId === safeAccountId)?.chains[String(chainId)];
      if (!snapshot) {
        setActionDisabledReason("Safe is not verified on this chain");
      } else if (snapshot.capability === "observe") {
        setActionDisabledReason("No linked owner can propose on this chain");
      } else if (snapshot.capability === "blocked") {
        setActionDisabledReason(snapshot.blockedReason || "Safe actions are blocked on this chain");
      } else {
        setActionDisabledReason("");
      }
    });
    return () => { active = false; };
  }, [chainId, safeAccountId]);

  return (
    <HomeQuickActions
      hasConnectedApps={hasConnectedApps}
      onSend={onSend}
      onSwap={onSwap}
      onMore={onMore}
      disabledActions={{
        send: actionDisabledReason || undefined,
        swap: actionDisabledReason || undefined,
      }}
    />
  );
}
