import { useCallback, useEffect, useMemo, useState } from "react";

import {
  parseUnshieldError,
  parseUnshieldResponse,
  validateUnshieldInput,
  type UnshieldOperation,
} from "../model/unshield";

export type UnshieldState =
  | { status: "idle"; operation: null; error: null }
  | { status: "quoting" | "proving"; operation: UnshieldOperation | null; error: null }
  | { status: "quoted" | "submitted"; operation: UnshieldOperation; error: null }
  | { status: "error"; operation: UnshieldOperation | null; error: string };

export function useUnshield(input: {
  availableWei: bigint;
  onComplete: () => void;
}) {
  const [amount, setAmountValue] = useState("");
  const [recipient, setRecipientValue] = useState("");
  const [state, setState] = useState<UnshieldState>({ status: "idle", operation: null, error: null });
  const validation = useMemo(
    () => validateUnshieldInput(amount, recipient, input.availableWei),
    [amount, recipient, input.availableWei],
  );
  const resetQuote = useCallback(() => {
    setState((current) => current.status === "quoting" || current.status === "proving"
      ? current
      : { status: "idle", operation: null, error: null });
  }, []);
  const setAmount = useCallback((value: string) => { setAmountValue(value); resetQuote(); }, [resetQuote]);
  const setRecipient = useCallback((value: string) => { setRecipientValue(value); resetQuote(); }, [resetQuote]);

  const quote = useCallback(async () => {
    if (!validation.valid) return;
    setState({ status: "quoting", operation: null, error: null });
    try {
      const response = await chrome.runtime.sendMessage({
        type: "privacyPrepareUnshieldQuote",
        requestId: crypto.randomUUID(),
        amountWei: validation.amountWei.toString(),
        recipient: validation.recipient,
      });
      const operation = parseUnshieldResponse(response);
      if (!operation) throw new Error(parseUnshieldError(response) ?? "Couldn’t get an Unshield quote.");
      setState({ status: "quoted", operation, error: null });
    } catch (error) {
      setState({ status: "error", operation: null, error: error instanceof Error ? error.message : "Couldn’t get an Unshield quote." });
    }
  }, [validation]);

  const execute = useCallback(async () => {
    if (state.status !== "quoted") return;
    const quoted = state.operation;
    setState({ status: "proving", operation: quoted, error: null });
    try {
      const response = await chrome.runtime.sendMessage({
        type: "privacyExecuteUnshield",
        operationId: quoted.id,
      });
      const operation = parseUnshieldResponse(response);
      if (!operation) throw new Error(parseUnshieldError(response) ?? "Unshield didn’t complete.");
      setState({ status: "submitted", operation, error: null });
      input.onComplete();
    } catch (error) {
      setState({ status: "error", operation: quoted, error: error instanceof Error ? error.message : "Unshield didn’t complete." });
      input.onComplete();
    }
  }, [input, state]);

  useEffect(() => {
    if (input.availableWei === 0n) setState({ status: "idle", operation: null, error: null });
  }, [input.availableWei]);

  return { amount, recipient, setAmount, setRecipient, validation, state, quote, execute };
}
