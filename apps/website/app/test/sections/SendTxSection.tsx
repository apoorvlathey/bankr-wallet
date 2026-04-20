"use client";

import { Text } from "@chakra-ui/react";
import { useAccount, useChainId } from "wagmi";
import { encodeFunctionData, erc20Abi, maxUint256, parseUnits } from "viem";
import { useEip1193 } from "../hooks/useEip1193";
import { TEST_CHAINS } from "../constants";
import { TestButton } from "./TestButton";

export function SendTxSection() {
  const request = useEip1193();
  const { address } = useAccount();
  const chainId = useChainId();
  const chain = TEST_CHAINS[chainId];
  const usdc = chain?.usdc;

  if (!request || !address) {
    return (
      <Text fontSize="sm" color="gray.500">
        Connect a wallet to enable these tests.
      </Text>
    );
  }

  const sendEth = () =>
    request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          to: address,
          value: "0x1",
        },
      ],
    });

  const sendEthWithData = () =>
    request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          to: address,
          value: "0x0",
          data: "0xdeadbeef",
        },
      ],
    });

  const sendZeroUsdc = () => {
    if (!usdc) throw new Error(`No USDC configured on ${chain?.name ?? chainId}`);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [address, 0n],
    });
    return request({
      method: "eth_sendTransaction",
      params: [{ from: address, to: usdc.address, data, value: "0x0" }],
    });
  };

  const sendRevertingUsdc = () => {
    if (!usdc) throw new Error(`No USDC configured on ${chain?.name ?? chainId}`);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [address, maxUint256],
    });
    return request({
      method: "eth_sendTransaction",
      params: [{ from: address, to: usdc.address, data, value: "0x0" }],
    });
  };

  // Uniswap Permit2 — deployed at the same address on every chain.
  const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

  const approveUsdc = () => {
    if (!usdc) throw new Error(`No USDC configured on ${chain?.name ?? chainId}`);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2, parseUnits("100", usdc.decimals)],
    });
    return request({
      method: "eth_sendTransaction",
      params: [{ from: address, to: usdc.address, data, value: "0x0" }],
    });
  };

  const approveUnlimitedUsdc = () => {
    if (!usdc) throw new Error(`No USDC configured on ${chain?.name ?? chainId}`);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2, maxUint256],
    });
    return request({
      method: "eth_sendTransaction",
      params: [{ from: address, to: usdc.address, data, value: "0x0" }],
    });
  };

  return (
    <>
      <TestButton
        label="Send 1 wei → self"
        description="Simple native transfer. Cheapest tx that opens the confirmation UI."
        onRun={sendEth}
      />
      <TestButton
        label="Send tx with data (no value)"
        description="Arbitrary 4-byte payload to self. Exercises calldata decoder + 'no asset change' UI."
        onRun={sendEthWithData}
      />
      <TestButton
        label={`USDC.transfer(self, 0) on ${chain?.name ?? "…"}`}
        description="Zero-value ERC-20 transfer. Triggers asset-change simulation."
        onRun={sendZeroUsdc}
        isDisabled={!usdc}
      />
      <TestButton
        label="Reverting tx (USDC.transfer of MAX_UINT)"
        description="Simulation should fail → red revert banner in confirmation UI."
        onRun={sendRevertingUsdc}
        variant="outline"
        isDisabled={!usdc}
      />
      <TestButton
        label={`USDC.approve(Permit2, 100) on ${chain?.name ?? "…"}`}
        description="Finite ERC-20 approval. Exercises approval-card editing + re-encoded calldata."
        onRun={approveUsdc}
        isDisabled={!usdc}
      />
      <TestButton
        label={`USDC.approve(Permit2, MAX_UINT) on ${chain?.name ?? "…"}`}
        description="Unlimited approval. Shows the red 'Unlimited' warning chip."
        onRun={approveUnlimitedUsdc}
        isDisabled={!usdc}
      />
    </>
  );
}
