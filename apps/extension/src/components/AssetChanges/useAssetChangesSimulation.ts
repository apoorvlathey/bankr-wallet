import { useEffect, useState } from "react";
import type {
  AssetChange,
  SimulationResult,
  TokenMetadataResult,
} from "@/chrome/txSimulation";
import { useScreenEntered } from "@/components/ScreenTransition";
import {
  buildSimulationMessage,
  isMetadataIncomplete,
  makeBatchCallsKey,
  makeSimulationFailureResult,
  shouldRetryMetadata,
} from "./assetChangesModel";
import type { AssetChangesDisplayProps } from "./types";

const MAX_RETRIES = 3;
const RETRY_DELAY = 2_500;

type SimulationProps = Pick<
  AssetChangesDisplayProps,
  | "txRequest"
  | "batchCalls"
  | "isNonAtomic"
  | "safeAddress"
  | "safeExecutionRequest"
  | "onRevertedChange"
  | "onSimulationUnavailableChange"
>;

export function useAssetChangesSimulation({
  txRequest,
  batchCalls,
  isNonAtomic,
  safeAddress,
  safeExecutionRequest,
  onRevertedChange,
  onSimulationUnavailableChange,
}: SimulationProps) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const batchCallsKey = makeBatchCallsKey(batchCalls);

  // Heavy simulation waits for the confirmation screen's entry animation.
  const screenEntered = useScreenEntered();

  useEffect(() => {
    if (!screenEntered) return;
    let cancelled = false;
    setLoading(true);
    setResult(null);

    const message = buildSimulationMessage({
      txRequest,
      batchCalls,
      isNonAtomic,
      safeAddress,
      safeExecutionRequest,
    });

    console.log(
      "[AssetChangesUI] Sending simulation message:",
      message.type,
      message,
    );
    chrome.runtime.sendMessage(message, (response: SimulationResult) => {
      if (cancelled) return;
      if (chrome.runtime.lastError) {
        console.error(
          "[AssetChangesUI] chrome.runtime.lastError:",
          chrome.runtime.lastError,
        );
        setResult(
          makeSimulationFailureResult(
            chrome.runtime.lastError.message ||
              "Asset change simulation unavailable",
          ),
        );
        setLoading(false);
        return;
      }
      if (!response) {
        console.error("[AssetChangesUI] Empty simulation response");
        setResult(
          makeSimulationFailureResult("Asset change simulation unavailable"),
        );
        setLoading(false);
        return;
      }
      console.log("[AssetChangesUI] Simulation response:", response);
      setResult(response);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // Simulate from the stable request id plus batch-call signature, not array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txRequest.id, batchCallsKey, safeAddress, safeExecutionRequest?.id, screenEntered]);

  useEffect(() => {
    if (!onRevertedChange) return;
    if (!result || result.simulationFailed) {
      onRevertedChange(false);
      return;
    }
    onRevertedChange(!result.txSuccess);
  }, [result, onRevertedChange]);

  useEffect(() => {
    if (!onSimulationUnavailableChange) return;
    onSimulationUnavailableChange(!!result?.simulationFailed);
  }, [result?.simulationFailed, onSimulationUnavailableChange]);

  useEffect(() => {
    if (!result || !shouldRetryMetadata(result)) return;

    let cancelled = false;
    let attempt = 0;
    let tokenChanges: AssetChange[] = result.tokenChanges;
    let nativeChange: AssetChange | null = result.nativeChange;

    function scheduleRetry() {
      if (cancelled || attempt >= MAX_RETRIES) return;
      attempt++;

      setTimeout(() => {
        if (cancelled) return;

        chrome.runtime.sendMessage(
          {
            type: "retryTokenMetadata",
            chainId: txRequest.tx.chainId,
            tokenChanges,
            accountAddress: txRequest.tx.from,
            nativeChange,
          },
          (response: TokenMetadataResult) => {
            if (cancelled || chrome.runtime.lastError) return;

            tokenChanges = response.tokenChanges;
            nativeChange = response.nativeChange ?? nativeChange;
            const stillIncomplete = isMetadataIncomplete(
              tokenChanges,
              nativeChange,
            );

            setResult((previous) =>
              previous
                ? {
                    ...previous,
                    tokenChanges,
                    nativeChange,
                    metadataComplete: !stillIncomplete,
                  }
                : previous,
            );

            if (stillIncomplete) scheduleRetry();
          },
        );
      }, attempt === 1 ? 0 : RETRY_DELAY);
    }

    scheduleRetry();

    return () => {
      cancelled = true;
    };
    // Retry scheduling is keyed to result status and request id to avoid duplicate timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.metadataComplete, result?.simulationFailed, txRequest.id]);

  return { loading, result };
}
