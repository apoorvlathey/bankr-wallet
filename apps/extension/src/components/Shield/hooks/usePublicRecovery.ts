import { useCallback, useState } from "react";
import type { ShieldSourceAccount } from "../model/shieldQuote";
import { isPrivacyAuthRequiredResponse } from "../model/shieldQuote";
import { isPrivacyPoolsMutationAccountType } from "@/chrome/privacy/deployment/accountPolicy";
import {
  parsePublicRecoveryPreviewsResponse,
  type PublicRecoveryPreview,
} from "../model/recovery";

export function usePublicRecovery(
  onQueued: () => void,
  onAuthRequired: () => void,
) {
  const [status, setStatus] = useState<
    "idle" | "previewing" | "ready" | "preparing" | "queued" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<PublicRecoveryPreview[]>([]);

  const inspect = useCallback((
    preferredOperationId: string | null = null,
  ) => {
    setStatus("previewing");
    setError(null);
    setPreviews([]);
    chrome.runtime.sendMessage({
      type: "privacyPreviewRagequit",
      preferredOperationId,
    }).then((response) => {
      if (isPrivacyAuthRequiredResponse(response)) {
        setStatus("idle");
        onAuthRequired();
        return;
      }
      const parsed = parsePublicRecoveryPreviewsResponse(response);
      if (!parsed) {
        setStatus("error");
        setError(typeof response?.error === "string"
          ? response.error
          : "Public exit unavailable. Try again.");
        return;
      }
      setPreviews(parsed);
      setStatus("ready");
    }).catch(() => {
      setStatus("error");
      setError("Public exit unavailable. Try again.");
    });
  }, [onAuthRequired]);

  const prepare = useCallback((
    account: ShieldSourceAccount | null,
    selectedPreviews: readonly PublicRecoveryPreview[],
  ) => {
    const selectedPreview = selectedPreviews[0] ?? null;
    if (
      !account ||
      !selectedPreview ||
      selectedPreviews.length > 8 ||
      !isPrivacyPoolsMutationAccountType(account.type) ||
      selectedPreviews.some((preview) =>
        account.id !== preview.accountId ||
        account.address.toLowerCase() !== preview.accountAddress.toLowerCase() ||
        account.type !== preview.accountType
      ) ||
      new Set(selectedPreviews.map((preview) => preview.commitmentId)).size !==
        selectedPreviews.length
    ) {
      setStatus("error");
      setError("The original deposit account is unavailable.");
      return;
    }
    setStatus("preparing");
    setError(null);
    const requestId = crypto.randomUUID();
    const selections = selectedPreviews.map((preview) => ({
      accountId: account.id,
      accountAddress: account.address,
      accountType: account.type as "bankr" | "privateKey" | "seedPhrase",
      commitmentId: preview.commitmentId,
      sourceOperationId: preview.sourceOperationId,
      expectedAmountWei: preview.amountWei.toString(),
    }));
    const message = selections.length === 1
      ? { type: "privacyPrepareRagequit", requestId, ...selections[0] }
      : { type: "privacyPrepareRagequitBatch", requestId, selections };
    chrome.runtime.sendMessage(message).then((response) => {
      if (isPrivacyAuthRequiredResponse(response)) {
        setStatus("ready");
        setError(null);
        onAuthRequired();
        return;
      }
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
  }, [onAuthRequired, onQueued]);

  const resetPreview = useCallback(() => {
    setStatus("idle");
    setError(null);
    setPreviews([]);
  }, []);

  return { status, error, previews, inspect, prepare, resetPreview };
}
