import { useCallback, useEffect, useMemo, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  snapBalanceSliderValue,
  useSliderValueSound,
} from "@/sounds/useSliderValueSound";
import { formatTokenAmount } from "../formatting";
import { useNativeMaxAmount } from "./useNativeMaxAmount";

interface UseTransferPreparationOptions {
  token: PortfolioToken | null;
  fromAddress: string;
  recipient: string;
  resolvedAddress: string | null;
}

export function useTransferPreparation({
  token,
  fromAddress,
  recipient,
  resolvedAddress,
}: UseTransferPreparationOptions) {
  const sliderSound = useSliderValueSound();
  const [amount, setAmount] = useState("");
  const [isUsdMode, setIsUsdMode] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [isMaxSelected, setIsMaxSelected] = useState(false);
  const [hexData, setHexData] = useState("");
  const [isHexDataExpanded, setIsHexDataExpanded] = useState(false);
  const [isContractDeployment, setIsContractDeployment] = useState(false);

  const isNativeToken = token?.contractAddress === "native";
  const trimmedHexData = hexData.trim();
  const hexDataIsEmpty =
    trimmedHexData === "" || trimmedHexData === "0x" || trimmedHexData === "0X";
  const isHexDataValid =
    !isNativeToken ||
    hexDataIsEmpty ||
    /^0x([0-9a-fA-F]{2})+$/.test(trimmedHexData);
  const hasNativeCalldata =
    Boolean(isNativeToken) && !hexDataIsEmpty && isHexDataValid;

  const nativeMaxAmount = useNativeMaxAmount({
    token,
    fromAddress,
    resolvedAddress,
    data: hasNativeCalldata ? trimmedHexData : "0x",
    isContractDeployment,
  });
  const effectiveMaxAmount = isNativeToken ? nativeMaxAmount : token?.balance;
  const isMaxAmountReady = Boolean(token && effectiveMaxAmount !== null);

  useEffect(() => {
    if (isContractDeployment && !hasNativeCalldata) {
      setIsContractDeployment(false);
    }
  }, [hasNativeCalldata, isContractDeployment]);

  const canShowDeployToggle =
    Boolean(isNativeToken) &&
    (isContractDeployment || !recipient.trim());
  const hasPrice = token ? token.priceUsd > 0 : false;
  const balanceNum = token ? parseFloat(token.balance) : 0;

  const tokenAmount = useMemo(() => {
    if (!token) return "";
    if (isNativeToken && isMaxSelected) {
      return nativeMaxAmount ?? "";
    }
    if (!amount) return hasNativeCalldata ? "0" : "";
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount < 0) return "";
    if (numericAmount === 0) return hasNativeCalldata ? "0" : "";
    if (isUsdMode && hasPrice) {
      const converted = numericAmount / token.priceUsd;
      const balance = parseFloat(token.balance);
      if (converted >= balance) return token.balance;
      return converted.toFixed(token.decimals);
    }
    return amount;
  }, [
    amount,
    hasNativeCalldata,
    hasPrice,
    isMaxSelected,
    isNativeToken,
    isUsdMode,
    nativeMaxAmount,
    token,
  ]);

  const isAmountValid = (): boolean => {
    if (!token || tokenAmount === "") return false;
    const numericAmount = parseFloat(tokenAmount);
    if (isNaN(numericAmount) || numericAmount < 0) return false;
    if (numericAmount === 0) return hasNativeCalldata;
    return numericAmount <= parseFloat(token.balance);
  };

  const setAmountFromSlider = useCallback((percentage: number) => {
    if (!token) return false;
    if (percentage === 0) {
      setAmount("");
      setIsMaxSelected(false);
    } else if (percentage === 100) {
      if (effectiveMaxAmount === null || effectiveMaxAmount === undefined) {
        return false;
      }
      const maxAmountNum = parseFloat(effectiveMaxAmount);
      setAmount(
        isUsdMode && hasPrice
          ? (Math.floor(maxAmountNum * token.priceUsd * 100) / 100).toFixed(2)
          : effectiveMaxAmount,
      );
      setIsMaxSelected(true);
    } else {
      const tokenAmountAtPercentage = (balanceNum * percentage) / 100;
      setAmount(
        isUsdMode && hasPrice
          ? (tokenAmountAtPercentage * token.priceUsd).toFixed(2)
          : tokenAmountAtPercentage === 0
            ? "0"
            : parseFloat(tokenAmountAtPercentage.toPrecision(6)).toString(),
      );
      setIsMaxSelected(false);
    }
    return true;
  }, [balanceNum, effectiveMaxAmount, hasPrice, isUsdMode, token]);

  const syncSliderFromAmount = (value: string) => {
    if (!token) return;
    const numericValue = parseFloat(value);
    if (!value || isNaN(numericValue) || numericValue <= 0 || balanceNum <= 0) {
      setSliderValue(0);
      return;
    }
    const tokenValue =
      isUsdMode && hasPrice ? numericValue / token.priceUsd : numericValue;
    setSliderValue(
      Math.min(100, Math.round((tokenValue / balanceNum) * 100)),
    );
  };

  const updateAmount = (value: string) => {
    if (!/^\d*\.?\d*$/.test(value)) return;
    setIsMaxSelected(false);
    setAmount(value);
    syncSliderFromAmount(value);
  };

  const setMaxAmount = () => {
    if (!token || !setAmountFromSlider(100)) return;
    setSliderValue(100);
  };

  const toggleAmountMode = () => {
    if (!token || !hasPrice) return;
    const numericAmount = parseFloat(amount);
    if (amount && !isNaN(numericAmount) && numericAmount > 0) {
      if (isUsdMode) {
        const converted = numericAmount / token.priceUsd;
        setAmount(
          converted >= balanceNum
            ? token.balance
            : formatTokenAmount(converted),
        );
      } else {
        setAmount((numericAmount * token.priceUsd).toFixed(2));
      }
    }
    setIsUsdMode(!isUsdMode);
  };

  const handleSliderChange = (value: number) => {
    const snapped = snapBalanceSliderValue(value);
    if (snapped === 100 && !isMaxAmountReady) return;
    if (!sliderSound.onValueChange(snapped)) return;
    if (setAmountFromSlider(snapped)) setSliderValue(snapped);
  };

  useEffect(() => {
    if (isMaxSelected && isMaxAmountReady) {
      setAmountFromSlider(100);
    }
  }, [
    effectiveMaxAmount,
    isMaxAmountReady,
    isMaxSelected,
    setAmountFromSlider,
  ]);

  const resetForSelection = () => {
    setAmount("");
    setIsUsdMode(false);
    setSliderValue(0);
    setIsMaxSelected(false);
    setHexData("");
    setIsHexDataExpanded(false);
  };

  return {
    amount,
    updateAmount,
    isUsdMode,
    sliderValue,
    handleSliderChange,
    handleSliderChangeStart: () => sliderSound.onChangeStart(sliderValue),
    handleSliderChangeEnd: (value: number) =>
      sliderSound.onChangeEnd(snapBalanceSliderValue(value)),
    setMaxAmount,
    isMaxAmountReady,
    toggleAmountMode,
    hasPrice,
    balanceNum,
    tokenAmount,
    isAmountValid,
    hexData,
    setHexData,
    isHexDataExpanded,
    setIsHexDataExpanded,
    trimmedHexData,
    hexDataIsEmpty,
    isHexDataValid,
    hasNativeCalldata,
    isNativeToken: Boolean(isNativeToken),
    isContractDeployment,
    setIsContractDeployment,
    canShowDeployToggle,
    resetForSelection,
  };
}

export type TransferPreparation = ReturnType<typeof useTransferPreparation>;
