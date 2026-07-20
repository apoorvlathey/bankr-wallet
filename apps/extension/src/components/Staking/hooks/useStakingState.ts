import { useCallback, useEffect, useState } from "react";
import { useScreenEntered } from "@/components/ScreenTransition";
import type { StakingMode, StakingState } from "../types";

export function useStakingState(owner: string, mode: StakingMode, previewAmount: bigint | null) {
  const entered = useScreenEntered();
  const [state, setState] = useState<StakingState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!owner) return;
    const response = await new Promise<{ success: boolean; data?: Record<string, string | null>; error?: string }>((resolve) => {
      chrome.runtime.sendMessage({
        type: "getWchanStakingState",
        owner,
        previewMode: mode,
        previewAmount: previewAmount?.toString(),
      }, resolve);
    });
    if (!response?.success || !response.data) {
      setError(response?.error || "Could not load staking balances");
      setLoading(false);
      return;
    }
    const data = response.data;
    setState({
      wchanBalance: BigInt(data.wchanBalance || "0"),
      stakedBalance: BigInt(data.stakedBalance || "0"),
      allowance: BigInt(data.allowance || "0"),
      penaltyBps: BigInt(data.penaltyBps || "0"),
      lastDepositTimestamp: BigInt(data.lastDepositTimestamp || "0"),
      earnedWeth: BigInt(data.earnedWeth || "0"),
      previewAmount: data.previewAmount ? BigInt(data.previewAmount) : null,
    });
    setError("");
    setLoading(false);
  }, [mode, owner, previewAmount]);

  useEffect(() => {
    if (!entered || !owner) return;
    const timer = window.setTimeout(() => void refresh(), previewAmount ? 250 : 0);
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [entered, owner, previewAmount, refresh]);

  return { state, error, loading, refresh };
}
