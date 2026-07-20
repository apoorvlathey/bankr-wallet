import { useCallback, useState } from "react";

export function usePublicRecovery(onQueued: () => void) {
  const [status, setStatus] = useState<"idle" | "preparing" | "queued" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback(() => {
    setStatus("preparing");
    setError(null);
    chrome.runtime.sendMessage({
      type: "privacyPrepareRagequit",
      requestId: crypto.randomUUID(),
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
