import { useCallback, useEffect, useRef, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import type {
  SponsoredTransferFailure,
  TransferAccountType,
} from "../types";
import {
  isSponsoredBaseUsdcCandidate,
  shouldUseSponsoredTransfer,
} from "../model/sponsoredTransferPolicy";

interface UseSponsoredTransferOptions {
  token: PortfolioToken | null;
  fromAddress: string;
  accountType: TransferAccountType;
  onTransferInitiated: (sponsored?: boolean) => void;
}

export function useSponsoredTransfer({
  token,
  fromAddress,
  accountType,
  onTransferInitiated,
}: UseSponsoredTransferOptions) {
  const [premiumStatus, setPremiumStatus] = useState<{
    isPremium: boolean;
    balance: string;
    sponsoredTransfersEnabled: boolean;
  } | null>(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [failure, setFailure] = useState<SponsoredTransferFailure | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const intentRef = useRef<{ fingerprint: string; id: string } | null>(null);
  const statusCheckedRef = useRef<string | null>(null);

  const isUsdcOnBase = isSponsoredBaseUsdcCandidate(token);

  useEffect(() => {
    if (!isUsdcOnBase) {
      setPremiumStatus(null);
      return;
    }
    setPremiumLoading(true);
    chrome.runtime.sendMessage(
      { type: "checkPremiumStatus", address: fromAddress },
      (
        result:
          | {
              isPremium: boolean;
              balance: string;
              sponsoredTransfersEnabled: boolean;
            }
          | undefined,
      ) => {
        if (result) setPremiumStatus(result);
        setPremiumLoading(false);
      },
    );
  }, [fromAddress, isUsdcOnBase]);

  const isSponsoredFlow = shouldUseSponsoredTransfer({
    isCandidate: isUsdcOnBase,
    premiumStatus,
    accountType,
  });

  const acknowledgeTransfer = useCallback(
    (intentId: string) => {
      void chrome.runtime
        .sendMessage({
          type: "acknowledgeSponsoredTransfer",
          intentId,
          fromAddress,
        })
        .catch(() => undefined);
    },
    [fromAddress],
  );

  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const result = await new Promise<{
        success: boolean;
        hasUnresolved: boolean;
        completed?: boolean;
        txId?: string;
        intentId?: string;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "checkSponsoredTransferStatus", fromAddress },
          resolve,
        );
      });
      if (result.completed) {
        if (!result.intentId) {
          setFailure({
            message:
              "Transfer completed, but its recovery record is invalid. Check again.",
            outcomeUncertain: true,
          });
          return;
        }
        acknowledgeTransfer(result.intentId);
        intentRef.current = null;
        onTransferInitiated(true);
        return;
      }
      if (result.hasUnresolved || !result.success) {
        setFailure({
          message:
            result.error ||
            "Transfer outcome is still unknown. Check again before sending another transfer.",
          outcomeUncertain: true,
        });
      } else {
        setFailure(null);
      }
    } finally {
      setIsCheckingStatus(false);
    }
  }, [acknowledgeTransfer, fromAddress, onTransferInitiated]);

  useEffect(() => {
    if (
      !isUsdcOnBase ||
      accountType === "impersonator" ||
      accountType === "ledger" ||
      accountType === "safe"
    ) return;
    const key = `${fromAddress.toLowerCase()}:8453:usdc`;
    if (statusCheckedRef.current === key) return;
    statusCheckedRef.current = key;
    void checkStatus();
  }, [accountType, checkStatus, fromAddress, isUsdcOnBase]);

  const execute = async ({
    to,
    amount,
    decimals,
  }: {
    to: string;
    amount: string;
    decimals: number;
  }) => {
    const fingerprint = [
      fromAddress.toLowerCase(),
      to.toLowerCase(),
      amount,
      String(decimals),
    ].join(":");
    if (!intentRef.current || intentRef.current.fingerprint !== fingerprint) {
      intentRef.current = { fingerprint, id: crypto.randomUUID() };
    }

    const result = await new Promise<{
      success: boolean;
      txId?: string;
      error?: string;
      outcomeUncertain?: boolean;
      intentId?: string;
      retryReady?: boolean;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "sponsoredTransfer",
          to,
          amount,
          decimals,
          fromAddress,
          intentId: intentRef.current!.id,
        },
        resolve,
      );
    });

    if (result.success) {
      if (!result.intentId) {
        setFailure({
          message:
            "WalletChan received an invalid transfer result. Check status before sending again.",
          outcomeUncertain: true,
        });
        return { retryReady: false };
      }
      acknowledgeTransfer(result.intentId);
      intentRef.current = null;
      onTransferInitiated(true);
    } else if (result.retryReady) {
      setFailure(null);
    } else {
      setFailure({
        message: result.error || "Could not complete sponsored transfer",
        outcomeUncertain: result.outcomeUncertain === true,
      });
    }
    return { retryReady: result.retryReady === true, error: result.error };
  };

  return {
    isUsdcOnBase,
    premiumStatus,
    premiumLoading,
    isSponsoredFlow,
    failure,
    clearFailure: () => setFailure(null),
    isCheckingStatus,
    checkStatus,
    execute,
  };
}

export type SponsoredTransferState = ReturnType<typeof useSponsoredTransfer>;
