"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";

const POLLING_INTERVAL = 30_000;

export interface VaultData {
  totalApy: number;
  wchanApy: number;
  wethApy: number;
  totalStaked: string;
  tvlUsd: number;
  sharePrice: string;
}

interface VaultDataContextType {
  vaultData: VaultData | null;
  isLoading: boolean;
  refetchVaultData: () => void;
}

const VaultDataContext = createContext<VaultDataContextType>({
  vaultData: null,
  isLoading: true,
  refetchVaultData: () => {},
});

export function VaultDataProvider({ children }: { children: ReactNode }) {
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchVaultData = useCallback(async () => {
    try {
      const res = await fetch("/api/vault-data");
      if (!res.ok) throw new Error(`vault-data API ${res.status}`);
      const data = await res.json();

      setVaultData({
        totalApy: data.totalApy ?? 0,
        wchanApy: data.wchanApy ?? 0,
        wethApy: data.wethApy ?? 0,
        totalStaked: data.totalStaked ?? "0",
        tvlUsd: data.tvlUsd ?? 0,
        sharePrice: data.sharePrice ?? "0",
      });
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to fetch vault data:", error);
      retryTimeoutRef.current = setTimeout(() => {
        fetchVaultData();
      }, 3000);
    }
  }, []);

  useEffect(() => {
    fetchVaultData();
    const interval = setInterval(() => fetchVaultData(), POLLING_INTERVAL);

    return () => {
      clearInterval(interval);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [fetchVaultData]);

  return (
    // @ts-ignore React 19 types conflict with monorepo React 18 types on Vercel
    <VaultDataContext.Provider
      value={{ vaultData, isLoading, refetchVaultData: fetchVaultData }}
    >
      {children}
    </VaultDataContext.Provider>
  );
}

export function useVaultData() {
  return useContext(VaultDataContext);
}
