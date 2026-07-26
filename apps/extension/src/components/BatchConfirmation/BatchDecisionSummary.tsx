import { HStack, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { GasEstimate } from "@/chrome/gasEstimation";
import ChainIcon from "@/components/ChainIcon";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import MultiTxGasEstimateDisplay from "@/components/MultiTxGasEstimateDisplay";
import type { ForceInclusionInfo } from "./types";
import {
  FeePaymentSelector,
  type FeePaymentQuoteSummary,
  type FeePaymentRequestKind,
} from "@/components/FeePaymentSelector";
import type { NativeFeePaymentSummary } from "@/components/feePaymentUi";

interface EncodedBatch {
  to: string;
  data: string;
  value: string;
}

interface BatchDecisionSummaryProps {
  calls: PendingBatchTxRequest["params"]["calls"];
  fromAddress: string;
  chainId: number;
  chainName: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "ledger" | "impersonator";
  decodedFunctionNames: Record<number, string>;
  isNonAtomic: boolean;
  isLocalSigningAccount: boolean;
  outerEncodedBatch: EncodedBatch;
  eip7702Delegate?: `0x${string}`;
  forceInclusion: boolean;
  forceInclusionInfo: ForceInclusionInfo | null;
  onGasEstimates: (estimates: GasEstimate[]) => void;
  onGasValidityChange: (valid: boolean) => void;
  onAnyFailedChange: (failed: boolean) => void;
  bundleId: string;
  feePaymentToken: "native" | `0x${string}`;
  feePaymentQuote: FeePaymentQuoteSummary | null;
  allowFeePaymentSelection: boolean;
  feePaymentRequestKind: FeePaymentRequestKind;
  onFeePaymentTokenChange: (token: "native" | `0x${string}`) => void;
  onFeePaymentQuoteChange: (quote: FeePaymentQuoteSummary | null) => void;
}

/** Keeps the pinned signer, execution route, and batch gas at the decision point. */
export function BatchDecisionSummary({
  calls,
  fromAddress,
  chainId,
  chainName,
  accountType,
  decodedFunctionNames,
  isNonAtomic,
  isLocalSigningAccount,
  outerEncodedBatch,
  eip7702Delegate,
  forceInclusion,
  forceInclusionInfo,
  onGasEstimates,
  onGasValidityChange,
  onAnyFailedChange,
  bundleId,
  feePaymentToken,
  feePaymentQuote,
  allowFeePaymentSelection,
  feePaymentRequestKind,
  onFeePaymentTokenChange,
  onFeePaymentQuoteChange,
}: BatchDecisionSummaryProps) {
  const [nativeFeeSummary, setNativeFeeSummary] =
    useState<NativeFeePaymentSummary | null>(null);

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

      {allowFeePaymentSelection && (
        <FeePaymentSelector
          txId={bundleId}
          chainId={chainId}
          requestKind={feePaymentRequestKind}
          value={feePaymentToken}
          quote={feePaymentQuote}
          disabled={forceInclusion}
          nativeSummary={nativeFeeSummary}
          onChange={onFeePaymentTokenChange}
          onQuoteChange={onFeePaymentQuoteChange}
        />
      )}

      {forceInclusion && forceInclusionInfo && (
        <HStack minW={0} justify="space-between" spacing={3}>
          <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
            Transacting on
          </Text>
          <HStack minW={0} justify="flex-end" spacing={1.5}>
            <ChainIcon chainId={chainId} chainName={chainName} size="15px" withChip />
            <Text color="fg.primary" fontSize="xs" fontWeight="600" noOfLines={1}>
              {chainName}
            </Text>
            <Text color="fg.muted" fontSize="2xs" fontWeight="600">
              via
            </Text>
            <ChainIcon
              chainId={forceInclusionInfo.l1ChainId}
              chainName={forceInclusionInfo.l1ChainName}
              size="15px"
              withChip
            />
            <Text color="fg.primary" fontSize="xs" fontWeight="600" noOfLines={1}>
              {forceInclusionInfo.l1ChainName}
            </Text>
          </HStack>
        </HStack>
      )}

      {feePaymentToken === "native" && <MultiTxGasEstimateDisplay
        transactions={calls.map((call, index) => ({
          tx: {
            from: fromAddress,
            to: call.to || "0x0000000000000000000000000000000000000000",
            data: call.data || "0x",
            value: call.value || "0x0",
            chainId,
          },
          label: decodedFunctionNames[index] || `Call ${index + 1}`,
        }))}
        accountType={accountType || "bankr"}
        isNonAtomic={isNonAtomic}
        onGasEstimates={isLocalSigningAccount ? onGasEstimates : undefined}
        onValidityChange={onGasValidityChange}
        onAnyFailedChange={onAnyFailedChange}
        forceInclusion={forceInclusion}
        batchedTx={
          isNonAtomic
            ? undefined
            : {
                tx: {
                  from: fromAddress,
                  to: outerEncodedBatch.to,
                  data: outerEncodedBatch.data,
                  value: outerEncodedBatch.value,
                  chainId,
                },
                label: "Batch transaction",
                detail: `(${calls.length} ${calls.length === 1 ? "call" : "calls"})`,
              }
        }
        eip7702Delegate={eip7702Delegate}
        onFeeSummaryChange={setNativeFeeSummary}
      />}
    </VStack>
  );
}
