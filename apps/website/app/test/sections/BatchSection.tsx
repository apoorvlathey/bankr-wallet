"use client";

import { Input, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { encodeFunctionData, erc20Abi, maxUint256, toHex } from "viem";
import { useEip1193 } from "../hooks/useEip1193";
import { TEST_CHAINS } from "../constants";
import { TestButton } from "./TestButton";

export function BatchSection() {
  const request = useEip1193();
  const { address } = useAccount();
  const chainId = useChainId();
  const chain = TEST_CHAINS[chainId];
  const usdc = chain?.usdc;
  const [bundleId, setBundleId] = useState("");

  if (!request || !address) {
    return (
      <Text fontSize="sm" color="gray.500">
        Connect a wallet to enable these tests.
      </Text>
    );
  }

  const chainIdHex = toHex(chainId);

  const usdcTransferCall = (amount: bigint) => ({
    to: usdc!.address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [address, amount],
    }),
    value: "0x0",
  });

  const sendCapabilities = () =>
    request({
      method: "wallet_getCapabilities",
      params: [address, [chainIdHex]],
    });

  const sendAtomicBatch = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          from: address,
          chainId: chainIdHex,
          atomicRequired: true,
          calls: [usdcTransferCall(0n), usdcTransferCall(0n)],
        },
      ],
    });
  };

  const sendNonAtomicBatch = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          from: address,
          chainId: chainIdHex,
          atomicRequired: false,
          calls: [
            usdcTransferCall(0n),
            usdcTransferCall(0n),
            { to: address, value: "0x1", data: "0x" },
          ],
        },
      ],
    });
  };

  const sendRevertingBatch = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          from: address,
          chainId: chainIdHex,
          atomicRequired: true,
          calls: [
            usdcTransferCall(0n),
            usdcTransferCall(maxUint256),
            usdcTransferCall(0n),
          ],
        },
      ],
    });
  };

  const getStatus = () => {
    if (!bundleId.trim()) throw new Error("Enter a bundle id first");
    return request({
      method: "wallet_getCallsStatus",
      params: [bundleId.trim()],
    });
  };

  const showStatus = () => {
    if (!bundleId.trim()) throw new Error("Enter a bundle id first");
    return request({
      method: "wallet_showCallsStatus",
      params: [bundleId.trim()],
    });
  };

  return (
    <>
      <TestButton
        label="wallet_getCapabilities"
        description="Returns per-chain atomic batching support. Silent RPC, no popup."
        onRun={sendCapabilities}
      />
      <TestButton
        label="2-call atomic batch"
        description="atomicRequired=true, 2 × USDC.transfer(self, 0). Bankr: ERC-7821 atomic. PK/Seed: auto-sequential."
        onRun={sendAtomicBatch}
        isDisabled={!usdc}
      />
      <TestButton
        label="3-call non-atomic batch"
        description="atomicRequired=false, 2 USDC transfers + 1 native. Exercises mixed calls."
        onRun={sendNonAtomicBatch}
        isDisabled={!usdc}
      />
      <TestButton
        label="Batch with a reverting call"
        description="Middle call is USDC.transfer(MAX) — exercises red revert banner in batch UI."
        onRun={sendRevertingBatch}
        variant="outline"
        isDisabled={!usdc}
      />
      <TestButton
        label="wallet_getCallsStatus"
        description="Poll status of a batch by id. 100=pending, 200=confirmed, 400=rejected, 500/600=revert."
        onRun={getStatus}
      >
        <Input
          size="sm"
          placeholder="bundle id (0x...)"
          value={bundleId}
          onChange={(e) => setBundleId(e.target.value)}
          fontFamily="mono"
          fontSize="xs"
          borderRadius={0}
          border="2px solid"
          borderColor="bauhaus.black"
          _focus={{ boxShadow: "none", borderColor: "bauhaus.blue" }}
        />
      </TestButton>
      <TestButton
        label="wallet_showCallsStatus"
        description="Ask wallet to render the status UI for a bundle id."
        onRun={showStatus}
        variant="outline"
      />
    </>
  );
}
