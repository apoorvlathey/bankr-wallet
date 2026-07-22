import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  HStack,
  Spinner,
  Text,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { FeePaymentOption } from "@/chrome/feePayment/capabilities";
import type { FeePaymentTokenId } from "@/chrome/feePayment/tokens";
import ShapesLoader from "@/components/Chat/ShapesLoader";
import TokenLogo from "@/components/TokenLogo";
import { ActionSheet } from "@/components/ui";
import {
  formatTokenAmount,
  type NativeFeePaymentSummary,
} from "@/components/feePaymentUi";

const OPTIONS_REQUEST_TIMEOUT_MS = 10_000;
const QUOTE_REQUEST_TIMEOUT_MS = 30_000;

interface FeePaymentSelectorProps {
  txId: string;
  chainId: number;
  value: FeePaymentTokenId;
  quote: FeePaymentQuoteSummary | null;
  disabled?: boolean;
  requestKind?: "transaction" | "batch" | "safe" | "swap";
  accountId?: string;
  requestPayload?: {
    chainId: number;
    calls: Array<{ to: string; data?: string; value?: string }>;
  };
  nativeSummary?: NativeFeePaymentSummary | null;
  onChange: (value: FeePaymentTokenId) => void;
  onQuoteChange: (quote: FeePaymentQuoteSummary | null) => void;
}

export interface FeePaymentQuoteSummary {
  quoteId: string | null;
  tokenId: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenStablecoin: boolean;
  maximumTokenCost: string;
  tokenBalance: string;
  expiresAt: number;
  approvalAdded: boolean;
  approvalAmount: string | null;
  paymaster: `0x${string}`;
  userOperationNonce: `0x${string}`;
  sufficientBalance: boolean;
  needsAuthorization: boolean;
}

export function FeePaymentSelector({
  txId,
  chainId,
  value,
  quote,
  disabled,
  requestKind = "transaction",
  accountId,
  requestPayload,
  nativeSummary,
  onChange,
  onQuoteChange,
}: FeePaymentSelectorProps) {
  const [options, setOptions] = useState<FeePaymentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const quoteRequestSequence = useRef(0);
  const quoteRequestStarted = useRef(Boolean(quote));
  const requestIdentity = `${requestKind}:${txId}:${accountId ?? ""}`;
  const previousRequestIdentity = useRef(requestIdentity);
  const quoteTimeoutRef = useRef<number | null>(null);
  const sheet = useDisclosure();

  const clearQuoteTimeout = useCallback(() => {
    if (quoteTimeoutRef.current === null) return;
    window.clearTimeout(quoteTimeoutRef.current);
    quoteTimeoutRef.current = null;
  }, []);

  const cancelQuoteRequest = useCallback(() => {
    quoteRequestSequence.current += 1;
    clearQuoteTimeout();
    setQuoteLoading(false);
  }, [clearQuoteTimeout]);

  const requestQuote = useCallback((requestedTokenId?: FeePaymentTokenId) => {
    const tokenId = requestedTokenId ?? value;
    if (tokenId === "native") return;
    const option = options.find((candidate) => candidate.id === tokenId);
    const tokenSymbol = option?.symbol ?? "token";
    clearQuoteTimeout();
    const sequence = ++quoteRequestSequence.current;
    quoteRequestStarted.current = true;
    setQuoteLoading(true);
    setQuoteError("");
    onQuoteChange(null);
    quoteTimeoutRef.current = window.setTimeout(() => {
      if (sequence !== quoteRequestSequence.current) return;
      quoteRequestSequence.current += 1;
      quoteTimeoutRef.current = null;
      setQuoteError(`${tokenSymbol} gas quote timed out`);
      onQuoteChange(null);
      setQuoteLoading(false);
    }, QUOTE_REQUEST_TIMEOUT_MS);
    chrome.runtime.sendMessage(
      {
        type: "prepareFeePaymentQuote",
        requestId: txId,
        requestKind,
        accountId,
        requestPayload,
        feePaymentToken: tokenId,
      },
      (result: Partial<FeePaymentQuoteSummary> & { success?: boolean; error?: string }) => {
        if (sequence !== quoteRequestSequence.current) return;
        clearQuoteTimeout();
        if (chrome.runtime.lastError) {
          setQuoteError(`${tokenSymbol} gas quote is unavailable`);
          setQuoteLoading(false);
          return;
        }
        if (
          !result?.success ||
          !result.quoteId ||
          !result.tokenId ||
          !result.tokenAddress ||
          !result.tokenSymbol ||
          !Number.isInteger(result.tokenDecimals) ||
          typeof result.tokenStablecoin !== "boolean" ||
          !result.maximumTokenCost ||
          !result.expiresAt ||
          result.tokenBalance === undefined ||
          !result.paymaster ||
          !result.userOperationNonce ||
          typeof result.sufficientBalance !== "boolean" ||
          typeof result.needsAuthorization !== "boolean"
        ) {
          setQuoteError(result?.error || `${tokenSymbol} gas quote is unavailable`);
          setQuoteLoading(false);
          return;
        }
        const summary: FeePaymentQuoteSummary = {
          quoteId: result.sufficientBalance ? result.quoteId : null,
          tokenId: result.tokenId,
          tokenAddress: result.tokenAddress,
          tokenSymbol: result.tokenSymbol,
          tokenDecimals: result.tokenDecimals!,
          tokenStablecoin: result.tokenStablecoin,
          maximumTokenCost: result.maximumTokenCost,
          tokenBalance: result.tokenBalance,
          expiresAt: result.expiresAt,
          approvalAdded: result.approvalAdded === true,
          approvalAmount: result.approvalAmount ?? null,
          paymaster: result.paymaster,
          userOperationNonce: result.userOperationNonce,
          sufficientBalance: result.sufficientBalance,
          needsAuthorization: result.needsAuthorization,
        };
        if (!summary.sufficientBalance) {
          setQuoteError(`Insufficient ${summary.tokenSymbol} balance for the maximum gas charge`);
        }
        onQuoteChange(summary);
        setQuoteLoading(false);
      },
    );
  }, [accountId, clearQuoteTimeout, onQuoteChange, options, requestKind, requestPayload, txId, value]);

  useEffect(() => {
    if (previousRequestIdentity.current === requestIdentity) return;
    previousRequestIdentity.current = requestIdentity;
    cancelQuoteRequest();
    quoteRequestStarted.current = false;
    setQuoteError("");
  }, [cancelQuoteRequest, requestIdentity]);

  useEffect(
    () => () => {
      quoteRequestSequence.current += 1;
      clearQuoteTimeout();
    },
    [clearQuoteTimeout],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false;
      setOptions([]);
      setLoading(false);
    }, OPTIONS_REQUEST_TIMEOUT_MS);
    chrome.runtime.sendMessage(
      { type: "getFeePaymentOptions", txId, requestKind, accountId, requestPayload },
      (result: { success: boolean; options?: FeePaymentOption[] }) => {
        if (!active) return;
        window.clearTimeout(timeout);
        setOptions(result?.success ? result.options ?? [] : []);
        setLoading(false);
      },
    );
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [accountId, requestKind, requestPayload, txId]);

  const isTokenPayment = value !== "native";
  useEffect(() => {
    if (
      isTokenPayment &&
      !quote &&
      !quoteLoading &&
      !quoteError &&
      !quoteRequestStarted.current &&
      options.length > 0
    ) requestQuote();
  }, [isTokenPayment, options.length, quote, quoteError, quoteLoading, requestQuote]);

  useEffect(() => {
    if (disabled || !isTokenPayment || !quote?.expiresAt) return;
    const timeout = window.setTimeout(() => {
      setQuoteError(`${quote.tokenSymbol} gas quote expired`);
      onQuoteChange(null);
    }, Math.max(1, quote.expiresAt - Date.now() - 1_000));
    return () => window.clearTimeout(timeout);
  }, [disabled, isTokenPayment, onQuoteChange, quote?.expiresAt, quote?.tokenSymbol]);

  const selected = options.find((option) => option.id === value);
  const maximumTokenCost = quote?.maximumTokenCost ?? null;
  const tokenBalance = quote?.tokenBalance ?? selected?.balance ?? null;
  const tokenDecimals = quote?.tokenDecimals ?? selected?.decimals ?? 18;
  const tokenSymbol = quote?.tokenSymbol ?? selected?.symbol ?? "Token";
  const isStablecoin = quote?.tokenStablecoin ?? selected?.stablecoin === true;
  const approvalAdded = quote?.approvalAdded === true;
  const sufficientBalance = quote?.sufficientBalance !== false;
  const formattedMaximum = maximumTokenCost
    ? formatTokenAmount(maximumTokenCost, tokenDecimals)
    : null;
  const formattedBalance = tokenBalance
    ? formatTokenAmount(tokenBalance, tokenDecimals)
    : null;
  const displayedQuoteError = quoteError || (
    quote && !quote.sufficientBalance
      ? `Insufficient ${tokenSymbol} balance for the maximum gas charge`
      : ""
  );
  const tokenLogo = (option: FeePaymentOption, size = "18px") => (
    <TokenLogo
      symbol={option.symbol}
      logoUrl={option.logoUrl}
      nativeChainId={option.id === "native" ? chainId : undefined}
      size={size}
      fontSize="7px"
    />
  );
  const selectOption = (optionId: string) => {
    const option = options.find((candidate) => candidate.id === optionId);
    if (!option?.available) return;
    onChange(option.id);
    sheet.onClose();
    if (option.id === "native") {
      cancelQuoteRequest();
      quoteRequestStarted.current = false;
      setQuoteError("");
      onQuoteChange(null);
    } else {
      requestQuote(option.id);
    }
  };

  return (
    <VStack align="stretch" spacing={1.5}>
      <HStack justify="space-between" minH="30px">
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          Pay network fee with
        </Text>
        {loading ? <Spinner size="xs" color="accent.highlight" /> : (
          <Button
            size="xs"
            h="30px"
            px={3}
            borderRadius="md"
            borderWidth="1px"
            borderColor="border.subtle"
            bg="surface.raised"
            color="fg.primary"
            fontSize="xs"
            isDisabled={disabled || options.length < 2}
            rightIcon={<ChevronDownIcon />}
            _hover={{ bg: "surface.raisedHover" }}
            onClick={sheet.onOpen}
          >
            <HStack spacing={1.5}>
              {selected && tokenLogo(selected)}
              <Text as="span" fontSize="xs" fontWeight="700">
                {selected?.symbol ?? "Choose"}
              </Text>
            </HStack>
          </Button>
        )}
      </HStack>
      {selected?.oneTimeUpgrade && (
        <Box px={2.5} py={2} borderRadius="md" bg="status.warning.tint" borderWidth="1px" borderColor="status.warning.border">
          <Text color="fg.secondary" fontSize="2xs" lineHeight="short">
            Includes a one-time smart-account upgrade to WalletChan's official delegate in this operation.
          </Text>
        </Box>
      )}
      {isTokenPayment && quoteLoading && (
        <HStack w="full" justify="center" spacing={2} role="status" aria-live="polite">
          <ShapesLoader size="6px" />
          <Text color="fg.muted" fontSize="2xs">Estimating Fees</Text>
        </HStack>
      )}
      {isTokenPayment && formattedMaximum && (
        <Text color={sufficientBalance ? "fg.secondary" : "status.error.fg"} fontSize="2xs">
          Maximum fee: {formattedMaximum} {tokenSymbol}{isStablecoin ? ` · ≈ $${formattedMaximum}` : ""}
        </Text>
      )}
      <ActionSheet
        isOpen={sheet.isOpen}
        onClose={sheet.onClose}
        title="Pay network fee with"
        description="Choose the asset used only for this transaction's network fee."
        choices={options.map((option) => {
          const isSelectedToken = option.id === value;
          const optionBalance = isSelectedToken && formattedBalance
            ? formattedBalance
            : option.balance
              ? formatTokenAmount(option.balance, option.decimals)
              : null;
          return {
            id: option.id,
            label: option.symbol,
            icon: tokenLogo(option, "24px"),
            description: option.unavailableReason ??
              (option.id !== "native"
                ? isSelectedToken && formattedMaximum
                  ? `${sufficientBalance ? "" : "Insufficient balance · "}Up to ${formattedMaximum} ${option.symbol}${option.stablecoin ? ` (≈ $${formattedMaximum})` : ""} · Balance ${optionBalance ?? "—"}`
                  : optionBalance
                    ? `Balance ${optionBalance} ${option.symbol}`
                    : "Balance unavailable"
                : nativeSummary
                  ? `${nativeSummary.insufficient ? "Insufficient balance · " : ""}${nativeSummary.amount}${nativeSummary.fiat ? ` · ${nativeSummary.fiat}` : ""} · Balance ${nativeSummary.balance}`
                  : "Pay directly with the chain's native token"),
            isSelected: isSelectedToken,
            isDisabled: !option.available,
          };
        })}
        footer={isTokenPayment ? (
          <Text color="fg.muted" fontSize="2xs" lineHeight="short">
            Routed by Pimlico through EntryPoint v0.7. {approvalAdded
              ? `The atomic operation includes an exact, bounded ${tokenSymbol} approval.`
              : `Your current ${tokenSymbol} allowance already covers the bounded maximum.`}
          </Text>
        ) : undefined}
        onSelect={selectOption}
      />
      {isTokenPayment && displayedQuoteError && (
        <HStack w="full" align="start" spacing={2}>
          <Text flex="1" color="status.error.fg" fontSize="xs" lineHeight="short">
            {displayedQuoteError}
          </Text>
          <Button flexShrink={0} size="xs" variant="ghost" color="status.error.fg" isDisabled={disabled} onClick={() => requestQuote()}>
            Retry
          </Button>
        </HStack>
      )}
    </VStack>
  );
}
