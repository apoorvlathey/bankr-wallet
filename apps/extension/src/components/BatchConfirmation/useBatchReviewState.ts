import { useState } from "react";
import { useDisclosure } from "@chakra-ui/react";
import type { GasEstimate } from "@/chrome/gasEstimation";

export function useBatchReviewState() {
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());
  const [decodedFunctionNames, setDecodedFunctionNames] = useState<
    Record<number, string>
  >({});
  const [cachedGasEstimates, setCachedGasEstimates] =
    useState<GasEstimate[] | null>(null);
  const [nativePriceUsd, setNativePriceUsd] = useState<number | null>(null);
  const [gasValid, setGasValid] = useState(true);
  const [forceInclusion, setForceInclusion] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [simulationReverted, setSimulationReverted] = useState(false);
  const [simulationUnavailable, setSimulationUnavailable] = useState(false);
  const [anyTxMayRevert, setAnyTxMayRevert] = useState(false);
  const splitModal = useDisclosure();

  const toggleCall = (index: number) => {
    setExpandedCalls((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const recordFunctionName = (index: number, name: string) => {
    setDecodedFunctionNames((previous) =>
      previous[index] === name ? previous : { ...previous, [index]: name },
    );
  };

  return {
    expandedCalls,
    decodedFunctionNames,
    cachedGasEstimates,
    setCachedGasEstimates,
    nativePriceUsd,
    setNativePriceUsd,
    gasValid,
    setGasValid,
    forceInclusion,
    setForceInclusion,
    showAdvanced,
    setShowAdvanced,
    simulationReverted,
    setSimulationReverted,
    simulationUnavailable,
    setSimulationUnavailable,
    anyTxMayRevert,
    setAnyTxMayRevert,
    splitModal,
    toggleCall,
    recordFunctionName,
  };
}

export type BatchReviewState = ReturnType<typeof useBatchReviewState>;
