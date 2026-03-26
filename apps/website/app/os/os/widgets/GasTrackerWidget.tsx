"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Box, VStack, HStack, Text, Spinner } from "@chakra-ui/react";
import type { WidgetComponentProps } from "../widgetRegistry";
import { ACCENT_BLUE } from "../win95styles";

const ETH_RPC = "https://ethereum-rpc.publicnode.com";

interface GasPrices {
  low: number;
  standard: number;
  fast: number;
  baseFee: number;
  timestamp: number;
}

/** Convert wei hex string to Gwei number with adaptive precision */
function weiHexToGwei(hex: string): number {
  return Number(BigInt(hex)) / 1e9;
}

/** Format Gwei with adaptive decimals */
function formatGwei(gwei: number): string {
  if (gwei < 0.1) return gwei.toFixed(3);
  if (gwei < 1) return gwei.toFixed(2);
  if (gwei < 10) return gwei.toFixed(1);
  return Math.round(gwei).toString();
}

async function fetchGasPrices(): Promise<GasPrices> {
  const res = await fetch(ETH_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_maxPriorityFeePerGas", params: [] },
      { jsonrpc: "2.0", id: 3, method: "eth_getBlockByNumber", params: ["latest", false] },
    ]),
  });
  const results = await res.json();

  const gasPriceWei = results.find((r: { id: number }) => r.id === 1)?.result as string;
  const maxPriorityWei = results.find((r: { id: number }) => r.id === 2)?.result as string;
  const block = results.find((r: { id: number }) => r.id === 3)?.result;

  const baseFeeWei = block?.baseFeePerGas as string;
  const baseFee = weiHexToGwei(baseFeeWei);
  const suggestedPriority = weiHexToGwei(maxPriorityWei);
  const suggestedGasPrice = weiHexToGwei(gasPriceWei);

  // Use suggested priority, but ensure minimum spread between tiers
  // so they don't all show the same value when priority is ~0
  const minPriority = Math.max(suggestedPriority, 0.001); // 0.001 Gwei floor

  // Low: base fee only (no priority tip — willing to wait)
  const low = baseFee;
  // Standard: base fee + 1x priority
  const standard = baseFee + minPriority;
  // Fast: base fee + 3x priority
  const fast = baseFee + minPriority * 3;

  return { low, standard, fast, baseFee, timestamp: Date.now() };
}

const REFRESH_INTERVAL = 12_000; // ~1 block

function GasTier({
  label,
  gwei,
  color,
  emoji,
}: {
  label: string;
  gwei: number;
  color: string;
  emoji: string;
}) {
  return (
    <VStack
      spacing="2px"
      flex={1}
      bg="rgba(255,255,255,0.04)"
      border="1px solid rgba(255,255,255,0.08)"
      borderRadius="8px"
      py="10px"
      px="6px"
    >
      <Text fontSize="16px">{emoji}</Text>
      <Text fontSize="20px" fontWeight="bold" color={color} lineHeight={1.1}>
        {formatGwei(gwei)}
      </Text>
      <Text fontSize="9px" color="rgba(255,255,255,0.4)" textTransform="uppercase" letterSpacing="0.5px">
        Gwei
      </Text>
      <Text fontSize="10px" fontWeight="600" color="rgba(255,255,255,0.6)" mt="2px">
        {label}
      </Text>
    </VStack>
  );
}

export function GasTrackerWidget({ config, onSaveConfig }: WidgetComponentProps) {
  const [prices, setPrices] = useState<GasPrices | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-save config on first render so widget is immediately "configured"
  useEffect(() => {
    if (!config) {
      onSaveConfig({ enabled: true });
    }
  }, [config, onSaveConfig]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchGasPrices();
      setPrices(data);
      setError("");
    } catch {
      setError("Failed to fetch gas prices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  if (loading && !prices) {
    return (
      <Box h="100%" display="flex" alignItems="center" justifyContent="center">
        <VStack spacing={2}>
          <Spinner size="sm" color={ACCENT_BLUE} />
          <Text fontSize="11px" color="rgba(255,255,255,0.5)">
            Fetching gas prices…
          </Text>
        </VStack>
      </Box>
    );
  }

  if (error && !prices) {
    return (
      <Box h="100%" display="flex" alignItems="center" justifyContent="center" p={4}>
        <Text fontSize="12px" color="#FF5F57" textAlign="center">
          {error}
        </Text>
      </Box>
    );
  }

  if (!prices) return null;

  const age = Math.round((Date.now() - prices.timestamp) / 1000);

  return (
    <VStack h="100%" justify="center" spacing="12px" px="16px" py="12px">
      {/* Header */}
      <HStack w="100%" justify="space-between" align="center">
        <HStack spacing="6px">
          <Text fontSize="13px" fontWeight="bold" color="white">
            ETH Gas Tracker
          </Text>
        </HStack>
        <HStack spacing="4px">
          <Box w="6px" h="6px" borderRadius="50%" bg={error ? "#FF5F57" : "#27C93F"} />
          <Text fontSize="9px" color="rgba(255,255,255,0.35)">
            {age < 2 ? "live" : `${age}s ago`}
          </Text>
        </HStack>
      </HStack>

      {/* Gas tiers */}
      <HStack spacing="8px" w="100%">
        <GasTier label="Low" gwei={prices.low} color="#27C93F" emoji="🐢" />
        <GasTier label="Standard" gwei={prices.standard} color={ACCENT_BLUE} emoji="🚗" />
        <GasTier label="Fast" gwei={prices.fast} color="#FFBD2E" emoji="🚀" />
      </HStack>

      {/* Base fee footer */}
      <HStack w="100%" justify="center" spacing="4px">
        <Text fontSize="10px" color="rgba(255,255,255,0.3)">
          Base Fee:
        </Text>
        <Text fontSize="10px" color="rgba(255,255,255,0.5)" fontWeight="600">
          {formatGwei(prices.baseFee)} Gwei
        </Text>
      </HStack>
    </VStack>
  );
}
