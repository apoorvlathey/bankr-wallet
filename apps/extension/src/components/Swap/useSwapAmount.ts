import { useMemo, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";

export function useSwapAmount(sellToken: PortfolioToken | null) {
  const [sellAmount, setSellAmount] = useState("");
  const [isUsdMode, setIsUsdMode] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [isMaxMode, setIsMaxMode] = useState(false);

  const hasPrice = sellToken ? sellToken.priceUsd > 0 : false;
  const sellBalance = sellToken ? parseFloat(sellToken.balance) : 0;
  const sellTokenAmount = useMemo(() => {
    if (!sellAmount) return "";
    const amount = parseFloat(sellAmount);
    if (Number.isNaN(amount) || amount <= 0) return "";
    if (isUsdMode && hasPrice && sellToken) {
      const converted = amount / sellToken.priceUsd;
      const finalAmount = isMaxMode
        ? Math.min(converted, sellBalance)
        : converted;
      return finalAmount.toFixed(sellToken.decimals);
    }
    return sellAmount;
  }, [sellAmount, isUsdMode, hasPrice, sellToken, sellBalance, isMaxMode]);

  const setAmountFromSlider = (percentage: number) => {
    if (!sellToken) return;
    setIsMaxMode(percentage === 100);
    if (percentage === 0) {
      setSellAmount("");
    } else if (percentage === 100) {
      setSellAmount(
        isUsdMode && hasPrice
          ? (sellBalance * sellToken.priceUsd).toFixed(2)
          : sellToken.balance,
      );
    } else {
      const tokenAmount = (sellBalance * percentage) / 100;
      setSellAmount(
        isUsdMode && hasPrice
          ? (tokenAmount * sellToken.priceUsd).toFixed(2)
          : tokenAmount === 0
            ? "0"
            : parseFloat(tokenAmount.toPrecision(6)).toString(),
      );
    }
  };

  const syncSliderFromAmount = (value: string) => {
    const amount = parseFloat(value);
    if (!value || Number.isNaN(amount) || amount <= 0 || sellBalance <= 0) {
      setSliderValue(0);
      return;
    }
    const tokenValue =
      isUsdMode && hasPrice && sellToken
        ? amount / sellToken.priceUsd
        : amount;
    setSliderValue(
      Math.min(100, Math.round((tokenValue / sellBalance) * 100)),
    );
  };

  const toggleMode = () => {
    if (!hasPrice || !sellToken) return;
    const amount = parseFloat(sellAmount);
    if (sellAmount && !Number.isNaN(amount) && amount > 0) {
      setSellAmount(
        isUsdMode
          ? parseFloat((amount / sellToken.priceUsd).toPrecision(6)).toString()
          : (amount * sellToken.priceUsd).toFixed(2),
      );
    }
    setIsUsdMode((current) => !current);
  };

  const resetAmount = () => {
    setSellAmount("");
    setSliderValue(0);
    setIsMaxMode(false);
  };

  return {
    sellAmount,
    setSellAmount,
    isUsdMode,
    setIsUsdMode,
    sliderValue,
    setSliderValue,
    isMaxMode,
    setIsMaxMode,
    hasPrice,
    sellBalance,
    sellTokenAmount,
    setAmountFromSlider,
    syncSliderFromAmount,
    toggleMode,
    resetAmount,
  };
}
