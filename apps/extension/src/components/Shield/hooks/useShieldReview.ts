import { useCallback, useEffect, useRef, useState } from "react";

import type { ShieldQuoteController } from "./useShieldQuote";
import { parseShieldQuoteError } from "../model/shieldQuote";
import {
  parseShieldReviewResponse,
  type ShieldPreparedReview,
} from "../model/shieldReview";
import type { ShieldSourceAccount } from "../model/shieldQuote";

export type ShieldReviewState =
  | { status: "idle"; review: null; error: null }
  | { status: "preparing"; review: null; error: null }
  | { status: "ready"; review: ShieldPreparedReview; error: null }
  | { status: "failed"; review: null; error: string };

const REVIEW_FALLBACK_ERROR = "Review unavailable. Try again.";

export interface ShieldReviewController {
  state: ShieldReviewState;
  prepare: () => void;
  reset: () => void;
}

export function useShieldReview(input: {
  account: ShieldSourceAccount | null;
  quote: ShieldQuoteController;
}): ShieldReviewController {
  const { account, quote } = input;
  const generation = useRef(0);
  const [state, setState] = useState<ShieldReviewState>({
    status: "idle",
    review: null,
    error: null,
  });

  useEffect(() => {
    generation.current += 1;
    setState({ status: "idle", review: null, error: null });
  }, [account?.id, account?.address, account?.type, quote.ethAmount]);

  const prepare = useCallback(() => {
    if (
      !account ||
      account.type === "impersonator" ||
      quote.validation.status !== "valid" ||
      quote.state.status !== "ready" ||
      !quote.state.quote.canAfford
    ) {
      return;
    }
    const requestGeneration = ++generation.current;
    const expectedAmountWei = quote.validation.amountWei;
    setState({ status: "preparing", review: null, error: null });
    chrome.runtime
      .sendMessage({
        type: "privacyPrepareShieldReview",
        accountId: account.id,
        accountAddress: account.address,
        accountType: account.type,
        amount: quote.ethAmount,
      })
      .then((response) => {
        if (generation.current !== requestGeneration) return;
        const review = parseShieldReviewResponse(
          response,
          account,
          expectedAmountWei,
        );
        setState(
          review
            ? { status: "ready", review, error: null }
            : {
                status: "failed",
                review: null,
                error: parseShieldQuoteError(response) ?? REVIEW_FALLBACK_ERROR,
              },
        );
      })
      .catch(() => {
        if (generation.current === requestGeneration) {
          setState({
            status: "failed",
            review: null,
            error: REVIEW_FALLBACK_ERROR,
          });
        }
      });
  }, [account, quote.ethAmount, quote.state, quote.validation]);

  return {
    state,
    prepare,
    reset: () => {
      generation.current += 1;
      setState({ status: "idle", review: null, error: null });
    },
  };
}
