import { HStack, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { GasOverrides } from "@/chrome/txHandlers";
import ChainIcon from "@/components/ChainIcon";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import GasEstimateDisplay from "@/components/GasEstimateDisplay";
import {
  FeePaymentSelector,
  type FeePaymentQuoteSummary,
} from "@/components/FeePaymentSelector";
import type { ForceInclusionInfo, TransactionAccountType } from "./types";
import type { NativeFeePaymentSummary } from "@/components/feePaymentUi";

interface TransactionDecisionSummaryProps {
  txRequest: PendingTxRequest;
  accountType?: TransactionAccountType;
  gasEstimateKey: number;
  forceInclusion: boolean;
  forceInclusionInfo: ForceInclusionInfo | null;
  destinationChainName: string;
  isValueMalformed: boolean;
  lockNativeFeePayment?: boolean;
  replacementGasError?: string | null;
  isReadOnly?: boolean;
  onGasOverrides: (overrides: GasOverrides | null) => void;
  onGasValidityChange: (valid: boolean) => void;
  feePaymentToken: "native" | `0x${string}`;
  feePaymentQuote: FeePaymentQuoteSummary | null;
  onFeePaymentTokenChange: (token: "native" | `0x${string}`) => void;
  onFeePaymentQuoteChange: (quote: FeePaymentQuoteSummary | null) => void;
}

/** Keeps the signing identity and fee in view at the decision point. */
export function TransactionDecisionSummary({
  txRequest,
  accountType,
  gasEstimateKey,
  forceInclusion,
  forceInclusionInfo,
  destinationChainName,
  isValueMalformed,
  lockNativeFeePayment = false,
  replacementGasError,
  isReadOnly = false,
  onGasOverrides,
  onGasValidityChange,
  feePaymentToken,
  feePaymentQuote,
  onFeePaymentTokenChange,
  onFeePaymentQuoteChange,
}: TransactionDecisionSummaryProps) {
  const [nativeFeeSummary, setNativeFeeSummary] =
    useState<NativeFeePaymentSummary | null>(null);

  return (
    <VStack align="stretch" spacing={2}>
      <HStack minW={0} justify="space-between" spacing={3}>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
          Signing with
        </Text>
        <HStack minW={0} justify="flex-end">
          <FromAccountDisplay address={txRequest.tx.from} />
        </HStack>
      </HStack>

      <FeePaymentSelector
        txId={txRequest.id}
        chainId={txRequest.tx.chainId}
        value={feePaymentToken}
        quote={feePaymentQuote}
        disabled={forceInclusion || lockNativeFeePayment}
        nativeSummary={nativeFeeSummary}
        onChange={onFeePaymentTokenChange}
        onQuoteChange={onFeePaymentQuoteChange}
      />

      {forceInclusion && forceInclusionInfo && (
        <HStack minW={0} justify="space-between" spacing={3}>
          <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
            Transacting on
          </Text>
          <HStack minW={0} justify="flex-end" spacing={1.5}>
            <ChainIcon
              chainId={txRequest.tx.chainId}
              chainName={destinationChainName}
              size="15px"
              withChip
            />
            <Text color="fg.primary" fontSize="xs" fontWeight="600" noOfLines={1}>
              {destinationChainName}
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

      {!isValueMalformed && feePaymentToken === "native" && (
        <>
          <GasEstimateDisplay
            key={gasEstimateKey}
            txRequest={txRequest}
            accountType={accountType}
            onGasOverrides={onGasOverrides}
            onValidityChange={onGasValidityChange}
            forceInclusion={forceInclusion}
            isReadOnly={isReadOnly}
            onFeeSummaryChange={setNativeFeeSummary}
          />
          {replacementGasError && (
            <Text
              role="alert"
              color="status.error.emphasis"
              fontSize="2xs"
              fontWeight="700"
            >
              {replacementGasError}. Choose Fast or raise the Custom fees.
            </Text>
          )}
        </>
      )}
    </VStack>
  );
}
