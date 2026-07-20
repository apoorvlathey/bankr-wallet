import { useCallback, useState } from "react";
import { useThemedToast } from "@/hooks/useThemedToast";

type ReplacementKind = "cancel" | "speedUp";

export function usePendingReplacementActions(txId: string) {
  const [preparing, setPreparing] = useState<ReplacementKind | null>(null);
  const toast = useThemedToast();
  const prepare = useCallback((kind: ReplacementKind) => {
    if (preparing) return;
    setPreparing(kind);
    chrome.runtime.sendMessage(
      { type: "prepareTransactionReplacement", txId, kind },
      (result: { success?: boolean; error?: string } | undefined) => {
        if (chrome.runtime.lastError || !result?.success) {
          toast({
            title: kind === "cancel" ? "Cancel unavailable" : "Speed up unavailable",
            description: result?.error || "Could not prepare the replacement transaction",
            status: "error",
          });
          setPreparing(null);
          return;
        }
        setPreparing(null);
      },
    );
  }, [preparing, toast, txId]);
  return { prepare, preparing };
}
