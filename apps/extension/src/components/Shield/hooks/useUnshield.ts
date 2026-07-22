import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  parseUnshieldError,
  parseUnshieldRelayFeeWarning,
  parseUnshieldResponse,
  validateUnshieldAmount,
  validateUnshieldInput,
  type UnshieldOperation,
  type UnshieldRelayFeeWarning,
} from "../model/unshield";
import { isPrivacyAuthRequiredResponse } from "../model/shieldQuote";

export type UnshieldState =
  | { status: "idle"; operation: null; error: null }
  | { status: "quoting" | "proving"; operation: UnshieldOperation | null; error: null }
  | { status: "quoted" | "submitted"; operation: UnshieldOperation; error: null }
  | { status: "fee-warning"; operation: null; error: null; warning: UnshieldRelayFeeWarning }
  | { status: "error"; operation: UnshieldOperation | null; error: string };

export function useUnshield(input: {
  availableWei: bigint;
  recipient: string;
  initialAmount: string;
  onComplete: () => void;
  onSubmitted?: (operation: UnshieldOperation) => void;
  onAuthRequired: () => void;
}) {
  const {
    availableWei,
    recipient,
    initialAmount,
    onComplete,
    onSubmitted,
    onAuthRequired,
  } = input;
  const quoteGeneration = useRef(0);
  const [amount, setAmountValue] = useState(initialAmount);
  const [state, setState] = useState<UnshieldState>({ status: "idle", operation: null, error: null });
  const amountValidation = useMemo(
    () => validateUnshieldAmount(amount, availableWei),
    [amount, availableWei],
  );
  const validation = useMemo(
    () => validateUnshieldInput(amount, recipient, availableWei),
    [amount, availableWei, recipient],
  );
  const resetQuote = useCallback(() => {
    quoteGeneration.current += 1;
    setState((current) => current.status === "proving"
      ? current
      : { status: "idle", operation: null, error: null });
  }, []);
  const setAmount = useCallback((value: string) => { setAmountValue(value); resetQuote(); }, [resetQuote]);

  const quote = useCallback(async () => {
    if (!validation.valid) return;
    const generation = ++quoteGeneration.current;
    setState({ status: "quoting", operation: null, error: null });
    try {
      const response = await chrome.runtime.sendMessage({
        type: "privacyPrepareUnshieldQuote",
        requestId: crypto.randomUUID(),
        amountWei: validation.amountWei.toString(),
        recipient: validation.recipient,
      });
      if (quoteGeneration.current !== generation) return;
      if (isPrivacyAuthRequiredResponse(response)) {
        setState({ status: "idle", operation: null, error: null });
        onAuthRequired();
        return;
      }
      const feeWarning = parseUnshieldRelayFeeWarning(response);
      if (feeWarning) {
        setState({
          status: "fee-warning",
          operation: null,
          error: null,
          warning: feeWarning,
        });
        return;
      }
      const operation = parseUnshieldResponse(response);
      if (!operation) throw new Error(parseUnshieldError(response) ?? "Couldn’t get a relay quote.");
      setState({ status: "quoted", operation, error: null });
    } catch (error) {
      if (quoteGeneration.current !== generation) return;
      setState({ status: "error", operation: null, error: error instanceof Error ? error.message : "Couldn’t get a relay quote." });
    }
  }, [onAuthRequired, validation]);

  const execute = useCallback(async () => {
    if (state.status !== "quoted") return;
    const quoted = state.operation;
    setState({ status: "proving", operation: quoted, error: null });
    try {
      const response = await chrome.runtime.sendMessage({
        type: "privacyExecuteUnshield",
        operationId: quoted.id,
      });
      if (isPrivacyAuthRequiredResponse(response)) {
        setState({ status: "quoted", operation: quoted, error: null });
        onAuthRequired();
        return;
      }
      const operation = parseUnshieldResponse(response);
      if (!operation) throw new Error(parseUnshieldError(response) ?? "Private transfer didn’t complete.");
      setState({ status: "submitted", operation, error: null });
      onComplete();
      onSubmitted?.(operation);
    } catch (error) {
      setState({ status: "error", operation: quoted, error: error instanceof Error ? error.message : "Private transfer didn’t complete." });
      onComplete();
    }
  }, [onAuthRequired, onComplete, onSubmitted, state]);

  useEffect(() => {
    if (availableWei !== 0n) return;
    quoteGeneration.current += 1;
    setState((current) =>
      current.status === "proving" || current.status === "submitted" ||
        (current.status === "error" && current.operation)
        ? current
        : { status: "idle", operation: null, error: null }
    );
  }, [availableWei]);

  useEffect(() => {
    resetQuote();
  }, [recipient, resetQuote]);

  return {
    amount,
    recipient,
    setAmount,
    amountValidation,
    validation,
    state,
    quote,
    execute,
    resetQuote,
  };
}
