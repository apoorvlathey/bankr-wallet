import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_SHIELD_AMOUNT,
  convertShieldAmountInputMode,
  formatShieldAmountConversion,
  formatShieldAmountInput,
  parseShieldQuoteError,
  parseShieldQuoteResponse,
  parseShieldAmountInputWei,
  shieldAmountInputInEth,
  validateShieldAmountInput,
  type ShieldAmountValidation,
  type ShieldQuote,
  type ShieldSourceAccount,
} from "../model/shieldQuote";

export type ShieldQuoteState =
  | { status: "idle"; quote: ShieldQuote | null; error: null }
  | { status: "loading"; quote: ShieldQuote | null; error: null }
  | { status: "ready"; quote: ShieldQuote; error: null }
  | { status: "failed"; quote: ShieldQuote | null; error: string };

const QUOTE_DELAY_MS = 350;
const QUOTE_FALLBACK_ERROR = "Quote unavailable. Try again.";

export interface ShieldQuoteController {
  amount: string;
  ethAmount: string;
  inputAmountWei: bigint | null;
  validation: ShieldAmountValidation;
  state: ShieldQuoteState;
  isUsdMode: boolean;
  hasPrice: boolean;
  conversionLabel: string | null;
  setAmount: (amount: string) => void;
  useMaximum: () => void;
  toggleAmountMode: () => void;
  formatAmountWei: (valueWei: bigint) => string;
}

export function useShieldQuote(input: {
  account: ShieldSourceAccount | null;
  enabled: boolean;
  priceUsd: number | null;
}): ShieldQuoteController {
  const { account, enabled, priceUsd } = input;
  const [amount, setAmount] = useState(DEFAULT_SHIELD_AMOUNT);
  const [isUsdMode, setIsUsdMode] = useState(false);
  const [state, setState] = useState<ShieldQuoteState>({
    status: "idle",
    quote: null,
    error: null,
  });
  const generation = useRef(0);
  const hasPrice = priceUsd !== null && Number.isFinite(priceUsd) && priceUsd > 0;
  const ethAmount = useMemo(
    () => shieldAmountInputInEth(amount, isUsdMode, priceUsd),
    [amount, isUsdMode, priceUsd],
  );
  const inputAmountWei = useMemo(
    () => parseShieldAmountInputWei(ethAmount),
    [ethAmount],
  );
  const validation = useMemo(
    () => validateShieldAmountInput(ethAmount),
    [ethAmount],
  );
  const conversionLabel = useMemo(
    () => formatShieldAmountConversion(amount, isUsdMode, priceUsd),
    [amount, isUsdMode, priceUsd],
  );
  const formatAmountWei = useCallback(
    (valueWei: bigint) => formatShieldAmountInput(valueWei, isUsdMode, priceUsd),
    [isUsdMode, priceUsd],
  );

  useEffect(() => {
    setAmount(DEFAULT_SHIELD_AMOUNT);
    setIsUsdMode(false);
    setState({ status: "idle", quote: null, error: null });
  }, [account?.id]);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    if (
      !enabled ||
      !account ||
      account.type === "impersonator" ||
      validation.status !== "valid"
    ) {
      setState((current) => ({
        status: "idle",
        quote: current.quote,
        error: null,
      }));
      return;
    }

    setState((current) => ({
      status: "loading",
      quote: current.quote,
      error: null,
    }));
    const timer = window.setTimeout(() => {
      chrome.runtime
        .sendMessage({
          type: "privacyQuoteShield",
          accountId: account.id,
          accountAddress: account.address,
          accountType: account.type,
          amount: ethAmount,
        })
        .then((response) => {
          if (generation.current !== requestGeneration) return;
          const quote = parseShieldQuoteResponse(
            response,
            validation.amountWei,
          );
          setState((current) =>
            quote
              ? { status: "ready", quote, error: null }
              : {
                  status: "failed",
                  quote: current.quote,
                  error:
                    parseShieldQuoteError(response) ?? QUOTE_FALLBACK_ERROR,
                },
          );
        })
        .catch(() => {
          if (generation.current === requestGeneration) {
            setState((current) => ({
              status: "failed",
              quote: current.quote,
              error: QUOTE_FALLBACK_ERROR,
            }));
          }
        });
    }, QUOTE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [account, enabled, ethAmount, validation]);

  return {
    amount,
    ethAmount,
    inputAmountWei,
    validation,
    state,
    isUsdMode,
    hasPrice,
    conversionLabel,
    setAmount,
    useMaximum: () => {
      if (state.quote) {
        setAmount(formatAmountWei(state.quote.maxShieldableWei));
      }
    },
    toggleAmountMode: () => {
      if (!hasPrice) return;
      setAmount(convertShieldAmountInputMode(amount, isUsdMode, priceUsd));
      setIsUsdMode((current) => !current);
    },
    formatAmountWei,
  };
}
