"use client";

import { Text } from "@chakra-ui/react";
import { useChainId } from "wagmi";
import { useEip1193 } from "../hooks/useEip1193";
import { TEST_CHAINS, WATCH_ASSET_TEST_PARAMS } from "../constants";
import { TestButton } from "./TestButton";

const USDC_LOGO = "https://assets.coingecko.com/coins/images/6319/thumb/usdc.png";

export function WatchAssetSection() {
  const request = useEip1193();
  const chainId = useChainId();
  const chain = TEST_CHAINS[chainId];
  const usdc = chain?.usdc;

  if (!request) {
    return (
      <Text fontSize="sm" color="gray.500">
        Connect a wallet to enable these tests.
      </Text>
    );
  }

  const watchWchan = () =>
    request({
      method: "wallet_watchAsset",
      params: WATCH_ASSET_TEST_PARAMS as unknown as readonly unknown[],
    });

  const watchUsdc = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: usdc.address,
          symbol: usdc.symbol,
          decimals: usdc.decimals,
          image: USDC_LOGO,
        },
      } as unknown as readonly unknown[],
    });
  };

  const watchMinimal = () =>
    request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
          symbol: "LINK",
          decimals: 18,
        },
      } as unknown as readonly unknown[],
    });

  return (
    <>
      <TestButton
        label="Watch WCHAN (with logo)"
        description="Adds WCHAN to the wallet's custom token list. Shows logo preview."
        onRun={watchWchan}
      />
      <TestButton
        label={`Watch USDC on ${chain?.name ?? "…"}`}
        description="Watch USDC on the active chain. Tests per-chain token storage."
        onRun={watchUsdc}
        isDisabled={!usdc}
      />
      <TestButton
        label="Watch LINK (no image)"
        description="Minimal EIP-747 payload, no logo URL — tests fallback rendering."
        onRun={watchMinimal}
        variant="outline"
      />
    </>
  );
}
