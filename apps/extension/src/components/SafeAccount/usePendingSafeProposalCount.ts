import { useEffect, useState } from "react";
import { isPendingSafeProposal } from "@/chrome/safe/proposalStatus";
import type { SafeProposalRecord } from "@/chrome/safe/types";

export function usePendingSafeProposalCount(safeAccountId?: string): number {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let active = true;
    const applyRecords = (records: SafeProposalRecord[]) => {
      if (!active) return;
      setPendingCount(records.filter((proposal) =>
        (!safeAccountId || proposal.safeAccountId === safeAccountId) &&
        isPendingSafeProposal(proposal)
      ).length);
    };
    const load = () => chrome.runtime.sendMessage(
      { type: "getSafeProposals" },
      (response) => {
        if (!active || chrome.runtime.lastError) return;
        const records = response?.success && Array.isArray(response.result)
          ? response.result as SafeProposalRecord[]
          : [];
        applyRecords(records);
      },
    );

    load();
    if (safeAccountId) {
      chrome.runtime.sendMessage(
        { type: "syncSafeRequests", accountId: safeAccountId },
        (response) => {
          if (
            !active ||
            chrome.runtime.lastError ||
            !response?.success ||
            !Array.isArray(response.result)
          ) return;
          applyRecords(response.result as SafeProposalRecord[]);
        },
      );
    }

    const listener = (message: { type?: string }) => {
      if (message.type === "safeProposalsUpdated") load();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      active = false;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [safeAccountId]);

  return pendingCount;
}
