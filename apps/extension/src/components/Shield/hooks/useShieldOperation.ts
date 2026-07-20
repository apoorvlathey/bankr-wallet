import { useCallback, useEffect, useRef, useState } from "react";

import type { ShieldQuoteController } from "./useShieldQuote";
import type { ShieldReviewController } from "./useShieldReview";
import { parseShieldQuoteError } from "../model/shieldQuote";
import type { ShieldSourceAccount } from "../model/shieldQuote";
import {
  parseShieldOperationResponse,
  type ShieldPendingOperation,
} from "../model/shieldOperation";

export type ShieldOperationState =
  | { status: "idle"; operation: null; error: null }
  | { status: "saving"; operation: null; error: null }
  | { status: "saved"; operation: ShieldPendingOperation; error: null }
  | { status: "failed"; operation: null; error: string };

export interface ShieldOperationController {
  state: ShieldOperationState;
  save: () => void;
  reset: () => void;
}

const FALLBACK_ERROR = "Couldn’t save this Shield operation. Try again.";

export function useShieldOperation(input: {
  account: ShieldSourceAccount | null;
  quote: ShieldQuoteController;
  review: ShieldReviewController;
  onSaved: () => void;
}): ShieldOperationController {
  const { account, quote, review, onSaved } = input;
  const generation = useRef(0);
  const requestId = useRef(crypto.randomUUID());
  const [state, setState] = useState<ShieldOperationState>({
    status: "idle",
    operation: null,
    error: null,
  });

  useEffect(() => {
    generation.current += 1;
    requestId.current = crypto.randomUUID();
    setState({ status: "idle", operation: null, error: null });
  }, [account?.id, account?.address, account?.type, quote.ethAmount]);

  const save = useCallback(() => {
    if (
      !account ||
      account.type === "impersonator" ||
      review.state.status !== "ready" ||
      quote.validation.status !== "valid" ||
      quote.state.status !== "ready" ||
      !quote.state.quote.canAfford
    ) {
      return;
    }
    const requestGeneration = ++generation.current;
    const stableRequestId = requestId.current;
    const expectedAmountWei = quote.validation.amountWei;
    setState({ status: "saving", operation: null, error: null });
    chrome.runtime
      .sendMessage({
        type: "privacyPrepareShield",
        requestId: stableRequestId,
        accountId: account.id,
        accountAddress: account.address,
        accountType: account.type,
        amount: quote.ethAmount,
      })
      .then((response) => {
        if (generation.current !== requestGeneration) return;
        const operation = parseShieldOperationResponse(
          response,
          account,
          expectedAmountWei,
        );
        if (!operation) {
          setState({
            status: "failed",
            operation: null,
            error: parseShieldQuoteError(response) ?? FALLBACK_ERROR,
          });
          return;
        }
        setState({ status: "saved", operation, error: null });
        onSaved();
      })
      .catch(() => {
        if (generation.current === requestGeneration) {
          setState({ status: "failed", operation: null, error: FALLBACK_ERROR });
        }
      });
  }, [account, onSaved, quote.ethAmount, quote.state, quote.validation, review.state]);

  return {
    state,
    save,
    reset: () => {
      generation.current += 1;
      requestId.current = crypto.randomUUID();
      setState({ status: "idle", operation: null, error: null });
    },
  };
}
