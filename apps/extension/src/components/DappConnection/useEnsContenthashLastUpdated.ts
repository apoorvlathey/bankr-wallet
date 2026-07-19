import { useEffect, useState } from "react";
import type { ContenthashHistoryState } from "./contenthashHistoryModel";

type HistoryResponse = {
  success?: boolean;
  updatedAt?: number | null;
  error?: string;
};

export function useEnsContenthashLastUpdated(
  ensName: string | null,
  enabled: boolean,
): ContenthashHistoryState {
  const [state, setState] = useState<{
    ensName: string | null;
    value: ContenthashHistoryState;
  }>({ ensName: null, value: { status: "idle", updatedAt: null } });

  useEffect(() => {
    let active = true;
    if (!enabled || !ensName) {
      setState({ ensName: null, value: { status: "idle", updatedAt: null } });
      return () => {
        active = false;
      };
    }
    setState({ ensName, value: { status: "loading", updatedAt: null } });

    chrome.runtime
      .sendMessage({ type: "getEnsContenthashLastUpdated", ensName })
      .then((response: HistoryResponse | undefined) => {
        if (!active) return;
        const value = response?.success ? response.updatedAt : null;
        setState({
          ensName,
          value:
            typeof value === "number" && Number.isFinite(value)
              ? { status: "found", updatedAt: value }
              : { status: "unavailable", updatedAt: null },
        });
      })
      .catch(() => {
        if (active) {
          setState({
            ensName,
            value: { status: "unavailable", updatedAt: null },
          });
        }
      });

    return () => {
      active = false;
    };
  }, [enabled, ensName]);

  if (!enabled || !ensName) return { status: "idle", updatedAt: null };
  if (state.ensName !== ensName) return { status: "loading", updatedAt: null };
  return state.value;
}
