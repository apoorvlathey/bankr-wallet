import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_SHIELD_AMOUNT,
  parseShieldQuoteError,
  parseShieldQuoteResponse,
  shieldMaximumInput,
  validateShieldAmountInput,
  type ShieldAmountValidation,
  type ShieldQuote,
  type ShieldSourceAccount,
} from "../model/shieldQuote";

export type ShieldQuoteState =
  | { status: "idle"; quote: null; error: null }
  | { status: "loading"; quote: null; error: null }
  | { status: "ready"; quote: ShieldQuote; error: null }
  | { status: "failed"; quote: null; error: string };

const QUOTE_DELAY_MS = 350;
const QUOTE_FALLBACK_ERROR = "Quote unavailable. Try again.";

export interface ShieldQuoteController {
  amount: string;
  validation: ShieldAmountValidation;
  state: ShieldQuoteState;
  setAmount: (amount: string) => void;
  useMaximum: () => void;
}

export function useShieldQuote(input: {
  account: ShieldSourceAccount | null;
  enabled: boolean;
}): ShieldQuoteController {
  const { account, enabled } = input;
  const [amount, setAmount] = useState(DEFAULT_SHIELD_AMOUNT);
  const [state, setState] = useState<ShieldQuoteState>({
    status: "idle",
    quote: null,
    error: null,
  });
  const generation = useRef(0);
  const validation = useMemo(
    () => validateShieldAmountInput(amount),
    [amount],
  );

  useEffect(() => {
    setAmount(DEFAULT_SHIELD_AMOUNT);
  }, [account?.id]);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    if (
      !enabled ||
      !account ||
      account.type === "impersonator" ||
      validation.status !== "valid"
    ) {
      setState({ status: "idle", quote: null, error: null });
      return;
    }

    setState({ status: "loading", quote: null, error: null });
    const timer = window.setTimeout(() => {
      chrome.runtime
        .sendMessage({
          type: "privacyQuoteShield",
          accountId: account.id,
          accountAddress: account.address,
          accountType: account.type,
          amount,
        })
        .then((response) => {
          if (generation.current !== requestGeneration) return;
          const quote = parseShieldQuoteResponse(
            response,
            validation.amountWei,
          );
          setState(
            quote
              ? { status: "ready", quote, error: null }
              : {
                  status: "failed",
                  quote: null,
                  error:
                    parseShieldQuoteError(response) ?? QUOTE_FALLBACK_ERROR,
                },
          );
        })
        .catch(() => {
          if (generation.current === requestGeneration) {
            setState({
              status: "failed",
              quote: null,
              error: QUOTE_FALLBACK_ERROR,
            });
          }
        });
    }, QUOTE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [account, amount, enabled, validation]);

  return {
    amount,
    validation,
    state,
    setAmount,
    useMaximum: () => {
      if (state.status === "ready") {
        setAmount(shieldMaximumInput(state.quote));
      }
    },
  };
}
