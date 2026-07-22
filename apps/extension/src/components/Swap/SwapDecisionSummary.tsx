import { HStack, Text, VStack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import type { GasEstimate } from "@/chrome/gasEstimation";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import MultiTxGasEstimateDisplay from "@/components/MultiTxGasEstimateDisplay";
import {
  FeePaymentSelector,
  type FeePaymentQuoteSummary,
} from "@/components/FeePaymentSelector";
import type { NativeFeePaymentSummary } from "@/components/feePaymentUi";
import type { SwapAccountType } from "./swapViewTypes";

interface SwapGasTransaction {
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    chainId: number;
    gas?: string;
  };
  label: string;
}

interface SwapDecisionSummaryProps {
  requestId: string;
  transactions: SwapGasTransaction[];
  fromAddress: string;
  accountId?: string;
  accountType: SwapAccountType;
  chainId: number;
  isBatched: boolean;
  batchedTx?: { to: string; data: string; value: string };
  eip7702Delegate?: `0x${string}`;
  feePaymentToken: "native" | `0x${string}`;
  feePaymentQuote: FeePaymentQuoteSummary | null;
  onFeePaymentTokenChange: (token: "native" | `0x${string}`) => void;
  onFeePaymentQuoteChange: (quote: FeePaymentQuoteSummary | null) => void;
  onGasEstimates?: (estimates: GasEstimate[]) => void;
  onValidityChange?: (valid: boolean) => void;
}

export function SwapDecisionSummary({
  requestId,
  transactions,
  fromAddress,
  accountId,
  accountType,
  chainId,
  isBatched,
  batchedTx,
  eip7702Delegate,
  feePaymentToken,
  feePaymentQuote,
  onFeePaymentTokenChange,
  onFeePaymentQuoteChange,
  onGasEstimates,
  onValidityChange,
}: SwapDecisionSummaryProps) {
  const [nativeFeeSummary, setNativeFeeSummary] =
    useState<NativeFeePaymentSummary | null>(null);
  const requestPayload = useMemo(() => ({
    chainId,
    calls: transactions.map(({ tx }) => ({
      to: tx.to,
      data: tx.data ?? "0x",
      value: tx.value ?? "0x0",
    })),
  }), [chainId, transactions]);

  return (
    <VStack align="stretch" spacing={2}>
      <HStack minW={0} justify="space-between" spacing={3}>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
          Signing with
        </Text>
        <HStack minW={0} justify="flex-end">
          <FromAccountDisplay address={fromAddress} />
        </HStack>
      </HStack>

      <FeePaymentSelector
        txId={requestId}
        chainId={chainId}
        requestKind="swap"
        accountId={accountId}
        requestPayload={requestPayload}
        value={feePaymentToken}
        quote={feePaymentQuote}
        nativeSummary={nativeFeeSummary}
        onChange={onFeePaymentTokenChange}
        onQuoteChange={onFeePaymentQuoteChange}
      />

      {feePaymentToken === "native" && (
        <MultiTxGasEstimateDisplay
          transactions={transactions}
          accountType={accountType}
          batchedTx={batchedTx ? {
            tx: { ...batchedTx, from: fromAddress, chainId },
            label: "Batch transaction",
          } : undefined}
          isNonAtomic={!isBatched}
          eip7702Delegate={eip7702Delegate}
          onGasEstimates={onGasEstimates}
          onValidityChange={onValidityChange}
          onFeeSummaryChange={setNativeFeeSummary}
        />
      )}
    </VStack>
  );
}
