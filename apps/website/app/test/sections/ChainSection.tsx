"use client";

import { Text } from "@chakra-ui/react";
import { useChainId } from "wagmi";
import { toHex } from "viem";
import { useEip1193 } from "../hooks/useEip1193";
import { ADD_CHAIN_TEST_PARAMS, TEST_CHAINS } from "../constants";
import { TestButton } from "./TestButton";

export function ChainSection() {
  const request = useEip1193();
  const chainId = useChainId();

  if (!request) {
    return (
      <Text fontSize="sm" color="gray.500">
        Connect a wallet to enable these tests.
      </Text>
    );
  }

  const switchTo = (target: number) =>
    request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHex(target) }],
    });

  const switchToUnknown = () =>
    request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x14a34" }], // Base Sepolia — not in wallet registry
    });

  const addChain = () =>
    request({
      method: "wallet_addEthereumChain",
      params: [ADD_CHAIN_TEST_PARAMS],
    });

  const otherChains = Object.values(TEST_CHAINS).filter(
    (c) => c.chainId !== chainId,
  );
  const switchTarget = otherChains[0];

  return (
    <>
      <TestButton
        label={
          switchTarget
            ? `Switch → ${switchTarget.name}`
            : "Switch chain (no targets)"
        }
        description="Silent if the chain is already in the wallet registry."
        onRun={() => {
          if (!switchTarget) throw new Error("No other supported chain to switch to");
          return switchTo(switchTarget.chainId);
        }}
        isDisabled={!switchTarget}
      />
      <TestButton
        label="Switch → unknown chain (Base Sepolia)"
        description="Chain id not in wallet registry — wallet should respond with an error or prompt to add."
        onRun={switchToUnknown}
        variant="outline"
      />
      <TestButton
        label="Add Base Sepolia"
        description="Triggers the Add-Chain confirmation popup with RPC + explorer + native currency."
        onRun={addChain}
      />
    </>
  );
}
