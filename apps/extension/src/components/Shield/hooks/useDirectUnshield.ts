import { useCallback, useState } from "react";
import type { Account } from "@/chrome/types";
import {
  parseUnshieldError,
  parseUnshieldResponse,
  type UnshieldOperation,
} from "../model/unshield";
import { isPrivacyAuthRequiredResponse } from "../model/shieldQuote";

type SigningAccount = Extract<Account, { type: "bankr" | "privateKey" | "seedPhrase" }>;

export type DirectUnshieldState =
  | { status: "idle"; operation: null; error: null }
  | { status: "preparing"; operation: null; error: null }
  | { status: "queued"; operation: UnshieldOperation; error: null }
  | { status: "error"; operation: null; error: string };

export function useDirectUnshield(input: {
  amountWei: bigint | null;
  recipient: string;
  account: SigningAccount | null;
  onAuthRequired: () => void;
  onQueued?: (operation: UnshieldOperation) => void;
}) {
  const { amountWei, recipient, account, onAuthRequired, onQueued } = input;
  const [state, setState] = useState<DirectUnshieldState>({
    status: "idle",
    operation: null,
    error: null,
  });

  const prepare = useCallback(async () => {
    if (!amountWei || amountWei <= 0n || !account) return;
    setState({ status: "preparing", operation: null, error: null });
    try {
      const response = await chrome.runtime.sendMessage({
        type: "privacyPrepareDirectUnshield",
        requestId: crypto.randomUUID(),
        amountWei: amountWei.toString(),
        recipient,
        accountId: account.id,
        accountAddress: account.address,
        accountType: account.type,
      });
      if (isPrivacyAuthRequiredResponse(response)) {
        setState({ status: "idle", operation: null, error: null });
        onAuthRequired();
        return;
      }
      const operation = parseUnshieldResponse(response);
      if (!operation || operation.method !== "direct") {
        throw new Error(parseUnshieldError(response) ?? "Couldn’t prepare receiver-paid withdrawal.");
      }
      setState({ status: "queued", operation, error: null });
      onQueued?.(operation);
    } catch (error) {
      setState({
        status: "error",
        operation: null,
        error: error instanceof Error ? error.message : "Couldn’t prepare receiver-paid withdrawal.",
      });
    }
  }, [account, amountWei, onAuthRequired, onQueued, recipient]);

  const reset = useCallback(() => {
    setState((current) => current.status === "preparing"
      ? current
      : { status: "idle", operation: null, error: null });
  }, []);

  return { state, prepare, reset };
}
