"use client";

import { Text } from "@chakra-ui/react";
import { useAccount, useChainId } from "wagmi";
import {
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  parseAbi,
  parseUnits,
  toHex,
  type Address,
} from "viem";
import { TEST_CHAINS } from "../constants";
import { useEip1193 } from "../hooks/useEip1193";
import { TestButton } from "./TestButton";

const ETHEREUM_CHAIN_ID = 1;
const BASE_CHAIN_ID = 8453;
const ALPHA_USDC_DELTA_V2: Address =
  "0x0bF0164D17469241B6E086dA4016DCc54FEAA334";
const APPROVAL_ASSET_CHANGE_RECIPIENT: Address =
  "0x63A556c75443b176b5A4078e929e38bEb37a1ff2";
const SELF_MULTICALL_ABI = parseAbi([
  "function multicall(bytes[] data) returns (bytes[] results)",
]);
const ERC20_ALLOWANCE_MUTATION_ABI = parseAbi([
  "function increaseAllowance(address spender, uint256 addedValue) returns (bool)",
]);

export function ApprovalSection() {
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

  const approve = (amount: bigint) => encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [address, amount],
  });

  const sendDirectApproval = (amount: bigint) => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return request({
      method: "eth_sendTransaction",
      params: [{
        from: address,
        to: usdc.address,
        value: "0x0",
        data: approve(amount),
      }],
    });
  };

  const sendIncreaseAllowance = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    const data = encodeFunctionData({
      abi: ERC20_ALLOWANCE_MUTATION_ABI,
      functionName: "increaseAllowance",
      args: [address, parseUnits("25", usdc.decimals)],
    });
    return request({
      method: "eth_sendTransaction",
      params: [{
        from: address,
        to: usdc.address,
        value: "0x0",
        data,
      }],
    });
  };

  const sendBatchedApproval = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    const zeroTransfer = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [address, 0n],
    });
    return request({
      method: "wallet_sendCalls",
      params: [{
        version: "2.0.0",
        from: address,
        chainId: toHex(chainId),
        atomicRequired: true,
        calls: [
          { to: usdc.address, value: "0x0", data: zeroTransfer },
          {
            to: usdc.address,
            value: "0x0",
            data: approve(maxUint256),
          },
        ],
      }],
    });
  };

  const sendApprovalWithTransfer = () => {
    if (chainId !== BASE_CHAIN_ID) {
      throw new Error("Switch to Base for the approval + transfer test");
    }
    if (!usdc) throw new Error("No USDC config for Base");
    const transfer = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [
        APPROVAL_ASSET_CHANGE_RECIPIENT,
        parseUnits("1", usdc.decimals),
      ],
    });
    return request({
      method: "wallet_sendCalls",
      params: [{
        version: "2.0.0",
        from: address,
        chainId: toHex(BASE_CHAIN_ID),
        atomicRequired: true,
        calls: [
          {
            to: usdc.address,
            value: "0x0",
            data: approve(maxUint256),
          },
          { to: usdc.address, value: "0x0", data: transfer },
        ],
      }],
    });
  };

  const sendHiddenMulticallApproval = () => {
    if (chainId !== ETHEREUM_CHAIN_ID) {
      throw new Error("Switch to Ethereum for alphaUSDCDeltaV2");
    }
    const data = encodeFunctionData({
      abi: SELF_MULTICALL_ABI,
      functionName: "multicall",
      args: [[approve(maxUint256)]],
    });
    return request({
      method: "eth_sendTransaction",
      params: [{
        from: address,
        to: ALPHA_USDC_DELTA_V2,
        value: "0x0",
        data,
      }],
    });
  };

  return (
    <>
      <Text fontSize="xs" color="gray.600" fontWeight="600">
        These cases approve the connected account as spender, so an accidental
        confirmation does not grant a third party authority.
      </Text>
      <TestButton
        label={`Direct finite approval on ${chain?.name ?? "…"}`}
        description="USDC.approve(self, 100). The editable Request details approval card should be the only breakdown; Estimated changes should be omitted."
        onRun={() =>
          sendDirectApproval(parseUnits("100", usdc?.decimals ?? 6))
        }
        isDisabled={!usdc}
      />
      <TestButton
        label={`Direct approval revoke on ${chain?.name ?? "…"}`}
        description="USDC.approve(self, 0). The editable Revoke breakdown should remain, without a duplicate Estimated changes section."
        onRun={() => sendDirectApproval(0n)}
        isDisabled={!usdc}
      />
      <TestButton
        label={`Increase allowance on ${chain?.name ?? "…"}`}
        description="USDC.increaseAllowance(self, 25). This is not the editable approve form, so Estimated changes should verify and show the final allowance increase."
        onRun={sendIncreaseAllowance}
        isDisabled={!usdc}
      />
      <TestButton
        label={`Batched unlimited approval on ${chain?.name ?? "…"}`}
        description="wallet_sendCalls: transfer(self, 0) → approve(self, MAX_UINT256). The buried batch permission should appear first with unlimited-risk styling."
        onRun={sendBatchedApproval}
        isDisabled={!usdc}
      />
      <TestButton
        label="Unlimited approval + 1 USDC transfer (Base)"
        description="wallet_sendCalls: approve(self, MAX_UINT256) → transfer(0x63A5…1ff2, 1 USDC). The review should show the unlimited approval change and outgoing USDC asset change together."
        onRun={sendApprovalWithTransfer}
        isDisabled={chainId !== BASE_CHAIN_ID || !usdc}
      />
      <TestButton
        label="Hidden alphaUSDCDeltaV2 multicall approval"
        description="Ethereum only: alphaUSDCDeltaV2.multicall([approve(self, MAX_UINT256)]). Replays the real self-multicall attack shape while the top-level function selector remains multicall."
        onRun={sendHiddenMulticallApproval}
        isDisabled={chainId !== ETHEREUM_CHAIN_ID}
        variant="outline"
      />
    </>
  );
}
