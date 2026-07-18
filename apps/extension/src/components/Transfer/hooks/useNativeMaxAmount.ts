import { useEffect, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { GasEstimate } from "@/chrome/gasEstimation";
import { calculateNativeMaxAmount } from "../model/nativeMaxAmount";

interface UseNativeMaxAmountOptions {
  token: PortfolioToken | null;
  fromAddress: string;
  resolvedAddress: string | null;
  data: string;
  isContractDeployment: boolean;
}

export function useNativeMaxAmount({
  token,
  fromAddress,
  resolvedAddress,
  data,
  isContractDeployment,
}: UseNativeMaxAmountOptions): string | null {
  const [maxAmount, setMaxAmount] = useState<string | null>(null);

  useEffect(() => {
    if (!token || token.contractAddress !== "native" || !fromAddress) {
      setMaxAmount(null);
      return;
    }

    let cancelled = false;
    setMaxAmount(null);
    const tx = {
      from: fromAddress,
      // A self-transfer provides the standard 21k estimate before a recipient
      // is entered. Once resolved, the actual recipient/calldata is re-priced.
      ...(!isContractDeployment
        ? { to: resolvedAddress ?? fromAddress }
        : {}),
      data: data || "0x",
      // One wei exercises payable/value-bearing paths without making the gas
      // probe itself depend on the user's full requested amount.
      value: "0x1",
      chainId: token.chainId,
    };

    chrome.runtime.sendMessage(
      { type: "estimateGas", tx, accountAddress: fromAddress },
      (estimate: GasEstimate | undefined) => {
        if (cancelled) return;
        if (chrome.runtime.lastError || !estimate) {
          setMaxAmount(null);
          return;
        }
        setMaxAmount(
          calculateNativeMaxAmount(token.balance, token.decimals, estimate),
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [
    data,
    fromAddress,
    isContractDeployment,
    resolvedAddress,
    token,
  ]);

  return maxAmount;
}
