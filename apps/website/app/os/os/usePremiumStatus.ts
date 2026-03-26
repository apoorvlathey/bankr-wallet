"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { WCHAN_VAULT_INDEXER_API_URL } from "../../constants";

/** 20 million sWCHAN (18 decimals) */
export const PREMIUM_THRESHOLD = 20_000_000n * 10n ** 18n;

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function formatSWchanBalance(raw: bigint): string {
  const num = parseFloat(formatUnits(raw, 18));
  if (num === 0) return "0";
  if (num < 0.01) return "<0.01";
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function usePremiumStatus() {
  const { address, isConnected } = useAccount();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(
        `${WCHAN_VAULT_INDEXER_API_URL}/balances/${address.toLowerCase()}`
      );
      if (res.ok) {
        const data = await res.json();
        setBalance(BigInt(data.shares));
      } else {
        setBalance(0n);
      }
    } catch {
      setBalance(0n);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Fetch on mount / address change
  useEffect(() => {
    if (isConnected && address) {
      fetchBalance();
    } else {
      setBalance(null);
    }
  }, [isConnected, address, fetchBalance]);

  // Poll every 5 minutes
  useEffect(() => {
    if (!isConnected || !address) return;
    const interval = setInterval(fetchBalance, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isConnected, address, fetchBalance]);

  const isPremium = balance !== null && balance >= PREMIUM_THRESHOLD;

  return { isPremium, balance, isLoading, address };
}
