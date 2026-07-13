import { useEffect, useMemo, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  snapBalanceSliderValue,
  useSliderValueSound,
} from "@/sounds/useSliderValueSound";
import { formatTokenAmount } from "../formatting";

interface UseTransferPreparationOptions {
  token: PortfolioToken | null;
  recipient: string;
}

export function useTransferPreparation({
  token,
  recipient,
}: UseTransferPreparationOptions) {
  const sliderSound = useSliderValueSound();
  const [amount, setAmount] = useState("");
  const [isUsdMode, setIsUsdMode] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
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
  }, [amount, hasNativeCalldata, hasPrice, isUsdMode, token]);

  const isAmountValid = (): boolean => {
    if (!token || tokenAmount === "") return false;
    const numericAmount = parseFloat(tokenAmount);
    if (isNaN(numericAmount) || numericAmount < 0) return false;
    if (numericAmount === 0) return hasNativeCalldata;
    return numericAmount <= parseFloat(token.balance);
  };

  const setAmountFromSlider = (percentage: number) => {
    if (!token) return;
    if (percentage === 0) {
      setAmount("");
    } else if (percentage === 100) {
      setAmount(
        isUsdMode && hasPrice
          ? (balanceNum * token.priceUsd).toFixed(2)
          : token.balance,
      );
    } else {
      const tokenAmountAtPercentage = (balanceNum * percentage) / 100;
      setAmount(
        isUsdMode && hasPrice
          ? (tokenAmountAtPercentage * token.priceUsd).toFixed(2)
          : tokenAmountAtPercentage === 0
            ? "0"
            : parseFloat(tokenAmountAtPercentage.toPrecision(6)).toString(),
      );
    }
  };

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
    setAmount(value);
    syncSliderFromAmount(value);
  };

  const setMaxAmount = () => {
    if (!token) return;
    setSliderValue(100);
    setAmount(
      isUsdMode && hasPrice
        ? (balanceNum * token.priceUsd).toFixed(2)
        : token.balance,
    );
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
    if (!sliderSound.onValueChange(snapped)) return;
    setSliderValue(snapped);
    setAmountFromSlider(snapped);
  };

  const resetForSelection = () => {
    setAmount("");
    setIsUsdMode(false);
    setSliderValue(0);
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
