import { useLayoutEffect, useRef, useState } from "react";
import { useDisclosure } from "@chakra-ui/react";
import type { GasEstimate } from "@/chrome/gasEstimation";

export function getInitialExpandedCalls(): Set<number> {
  return new Set();
}

export function useBatchReviewState(requestId: string, callCount: number) {
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(() =>
    getInitialExpandedCalls(),
  );
  const previousRequestId = useRef(requestId);
  const previousCallCount = useRef(callCount);
  const [decodedFunctionNames, setDecodedFunctionNames] = useState<
    Record<number, string>
  >({});
  const [clearSigningActionNames, setClearSigningActionNames] = useState<
    Record<number, string>
  >({});
  const [cachedGasEstimates, setCachedGasEstimates] =
    useState<GasEstimate[] | null>(null);
  const [gasValid, setGasValid] = useState(true);
  const [forceInclusion, setForceInclusion] = useState(false);
  const [simulationReverted, setSimulationReverted] = useState(false);
  const [simulationUnavailable, setSimulationUnavailable] = useState(false);
  const [anyTxMayRevert, setAnyTxMayRevert] = useState(false);
  const splitModal = useDisclosure();

  useLayoutEffect(() => {
    const requestChanged = previousRequestId.current !== requestId;
    const callCountChanged = previousCallCount.current !== callCount;

    if (requestChanged || callCountChanged) {
      setExpandedCalls(getInitialExpandedCalls());
    }
    if (requestChanged || callCountChanged) {
      setDecodedFunctionNames({});
      setClearSigningActionNames({});
    }

    previousRequestId.current = requestId;
    previousCallCount.current = callCount;
  }, [callCount, requestId]);

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

  const recordClearSigningAction = (index: number, name?: string) => {
    setClearSigningActionNames((previous) => {
      if (name) {
        return previous[index] === name
          ? previous
          : { ...previous, [index]: name };
      }
      if (!(index in previous)) return previous;
      const next = { ...previous };
      delete next[index];
      return next;
    });
  };

  return {
    expandedCalls,
    decodedFunctionNames,
    clearSigningActionNames,
    cachedGasEstimates,
    setCachedGasEstimates,
    gasValid,
    setGasValid,
    forceInclusion,
    setForceInclusion,
    simulationReverted,
    setSimulationReverted,
    simulationUnavailable,
    setSimulationUnavailable,
    anyTxMayRevert,
    setAnyTxMayRevert,
    splitModal,
    toggleCall,
    recordFunctionName,
    recordClearSigningAction,
  };
}

export type BatchReviewState = ReturnType<typeof useBatchReviewState>;
