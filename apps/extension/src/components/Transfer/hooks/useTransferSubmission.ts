import { useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { buildTransferTx } from "@/chrome/transferUtils";
import { useThemedToast } from "@/hooks/useThemedToast";
import type { TransferAccountType } from "../types";
import type { SponsoredTransferState } from "./useSponsoredTransfer";

interface UseTransferSubmissionOptions {
  token: PortfolioToken | null;
  fromAddress: string;
  accountType: TransferAccountType;
  resolvedAddress: string | null;
  tokenAmount: string;
  chainName: string;
  isNativeToken: boolean;
  trimmedHexData: string;
  isContractDeployment: boolean;
  sponsored: SponsoredTransferState;
  onTransferInitiated: (sponsored?: boolean) => void;
}

export function useTransferSubmission({
  token,
  fromAddress,
  resolvedAddress,
  tokenAmount,
  chainName,
  isNativeToken,
  trimmedHexData,
  isContractDeployment,
  sponsored,
  onTransferInitiated,
}: UseTransferSubmissionOptions) {
  const toast = useThemedToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initiateNormalTransfer = async (deployment: boolean) => {
    if (!token || (!resolvedAddress && !deployment)) return;
    const txParts = buildTransferTx({
      to: deployment ? "0x" : resolvedAddress!,
      amount: tokenAmount,
      contractAddress: token.contractAddress,
      decimals: token.decimals,
      chainId: token.chainId,
      data: isNativeToken ? trimmedHexData : undefined,
    });
    const result = await new Promise<{
      success: boolean;
      txId?: string;
      error?: string;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "initiateTransfer",
          tx: {
            from: fromAddress,
            to: deployment ? null : txParts.to,
            data: txParts.data,
            value: txParts.value,
            chainId: token.chainId,
          },
          chainName,
          tokenName: deployment
            ? "Contract Deployment"
            : token.symbol.toUpperCase(),
          tokenLogo: token.logoUrl || null,
        },
        resolve,
      );
    });
    if (result.success) {
      onTransferInitiated();
    } else {
      toast({
        title: "Transfer failed",
        description: result.error || "Could not initiate transfer",
        status: "error",
        duration: 3000,
      });
    }
  };

  const submit = async (canSubmit: boolean) => {
    if (!canSubmit || !token) return;
    setIsSubmitting(true);
    try {
      if (sponsored.isSponsoredFlow) {
        const result = await sponsored.execute({
          to: resolvedAddress!,
          amount: tokenAmount,
          decimals: token.decimals,
        });
        if (result.retryReady) {
          toast({
            title: "Ready to retry",
            description: result.error,
            status: "info",
            duration: 3000,
          });
        }
        return;
      }
      await initiateNormalTransfer(isContractDeployment);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to initiate transfer",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendFallback = async () => {
    if (!token || !resolvedAddress || !tokenAmount) return;
    setIsSubmitting(true);
    sponsored.clearFailure();
    try {
      await initiateNormalTransfer(false);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to initiate transfer",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return { isSubmitting, submit, sendFallback };
}
