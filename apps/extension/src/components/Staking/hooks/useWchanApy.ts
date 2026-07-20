import { useEffect, useState } from "react";
import { useScreenEntered } from "@/components/ScreenTransition";
import { fetchJsonBounded } from "@/chrome/network/boundedHttp";
import { WALLETCHAN_VAULT_DATA_API } from "@/constants/externalUrls";
import type { StakingApy } from "../types";
import { normalizeWchanApy } from "../model/stakingApy";

export function useWchanApy(): StakingApy | null {
  const entered = useScreenEntered();
  const [apy, setApy] = useState<StakingApy | null>(null);

  useEffect(() => {
    if (!entered) return;
    let cancelled = false;
    const controller = new AbortController();

    const fetchDirect = () => {
      fetchJsonBounded(
        WALLETCHAN_VAULT_DATA_API,
        { method: "GET", signal: controller.signal },
        { timeoutMs: 8_000, maxBytes: 16 * 1024 },
      ).then(({ response, data }) => {
        const nextApy = response.ok ? normalizeWchanApy(data) : null;
        if (!cancelled && nextApy) setApy(nextApy);
      }).catch(() => {});
    };
    const refresh = () => {
      chrome.runtime.sendMessage({ type: "getWchanVaultApy" }, (response) => {
        if (cancelled) return;
        const nextApy = response?.success ? normalizeWchanApy(response.data) : null;
        if (nextApy) setApy(nextApy);
        else fetchDirect();
      });
    };

    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [entered]);

  return apy;
}
