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

  // ── Malformed-calldata attack vectors ─────────────────────────────────────
  // Non-canonical ABI encoding where the upper 12 bytes of an address-typed
  // argument are non-zero. A naive ".slice(-40)" parser would render a
  // "clean" recipient in the structured approval/transfer card while the
  // actual calldata is malformed — the wallet must REFUSE to sign these.
  //
  // Payloads from external bug report (see commit / PR description).
  const MALFORMED_APPROVE =
    "0x095ea7b310000000000000000000000000001f78189be22c3498cff1b8e02272c3220000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  const MALFORMED_INCREASE_ALLOWANCE =
    "0x3950935100010000000000000000000000001f78189be22c3498cff1b8e02272c3220000000000000000000000000000000000000000000023e6e54c450cad4f671c71c7";
  // Self-built malformed transfer: same pattern (non-zero high byte on the
  // recipient slot) since the bug-report transfer payloads were canonical.
  const MALFORMED_TRANSFER =
    "0xa9059cbb01000000000000000000000039317192afcb3d6e66e91023ecb2287e015ef3610000000000000000000000000000000000000000000000009a3298afb5ac71c7";

  const sendMalformed = (data: string) => {
    if (!usdc) throw new Error(`No USDC configured on ${chain?.name ?? chainId}`);
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
      <TestButton
        label={`Malformed approve (non-zero address padding) on ${chain?.name ?? "…"}`}
        description="Bug-report payload: ERC20 approve calldata where the upper 12 bytes of the spender slot are non-zero. Wallet MUST show a red 'Malformed calldata' banner and disable Confirm."
        onRun={() => sendMalformed(MALFORMED_APPROVE)}
        variant="outline"
        isDisabled={!usdc}
      />
      <TestButton
        label={`Malformed increaseAllowance on ${chain?.name ?? "…"}`}
        description="Bug-report payload: increaseAllowance with non-canonical address encoding. Confirm must stay disabled."
        onRun={() => sendMalformed(MALFORMED_INCREASE_ALLOWANCE)}
        variant="outline"
        isDisabled={!usdc}
      />
      <TestButton
        label={`Malformed transfer on ${chain?.name ?? "…"}`}
        description="Same non-zero-padding pattern applied to ERC20 transfer. Confirm must stay disabled."
        onRun={() => sendMalformed(MALFORMED_TRANSFER)}
        variant="outline"
        isDisabled={!usdc}
      />
    </>
  );
}
