import { useEffect, useState } from "react";

import type { Account } from "@/chrome/types";
import type { SafeAccountRecord } from "@/chrome/safe/types";

const EMPTY_CHAIN_IDS = new Set<number>();

export function useActiveSafeChainIds(
  account: Account | null,
): ReadonlySet<number> | null {
  const [state, setState] = useState<{
    accountId: string;
    chainIds: ReadonlySet<number>;
  } | null>(null);

  useEffect(() => {
    if (account?.type !== "safe") return;
    let active = true;
    const load = () => {
      chrome.runtime.sendMessage(
        { type: "getSafeAccounts" },
        (records: SafeAccountRecord[]) => {
          if (!active || chrome.runtime.lastError) return;
          const record = (records || []).find(
            (candidate) => candidate.accountId === account.id,
          );
          setState({
            accountId: account.id,
            chainIds: new Set(
              Object.values(record?.chains || {}).map(
                (snapshot) => snapshot.chainId,
              ),
            ),
          });
        },
      );
    };
    const listener = (message: { type?: string }) => {
      if (message.type === "safeAccountsUpdated") load();
    };
    load();
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      active = false;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [account]);

  if (account?.type !== "safe") return null;
  return state?.accountId === account.id ? state.chainIds : EMPTY_CHAIN_IDS;
}
