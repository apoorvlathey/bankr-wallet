import { useCallback, useState } from "react";
import type { ShieldSourceAccount } from "../model/shieldQuote";
import { isPrivacyPoolsMutationAccountType } from "@/chrome/privacy/deployment/accountPolicy";

export function usePublicRecovery(onQueued: () => void) {
  const [status, setStatus] = useState<"idle" | "preparing" | "queued" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback((account: ShieldSourceAccount | null) => {
    if (!account || !isPrivacyPoolsMutationAccountType(account.type)) {
      setStatus("error");
      setError("Choose the original deposit account.");
      return;
    }
    setStatus("preparing");
    setError(null);
    chrome.runtime.sendMessage({
      type: "privacyPrepareRagequit",
      requestId: crypto.randomUUID(),
      accountId: account.id,
      accountAddress: account.address,
      accountType: account.type,
    }).then((response) => {
      if (response?.success !== true) {
        setStatus("error");
        setError(typeof response?.error === "string" ? response.error : "Recovery unavailable. Try again.");
        return;
      }
      setStatus("queued");
      onQueued();
    }).catch(() => {
      setStatus("error");
      setError("Recovery unavailable. Try again.");
    });
  }, [onQueued]);

  return { status, error, prepare };
}
