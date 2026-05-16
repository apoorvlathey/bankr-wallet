"use client";

import { Input, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  maxUint256,
  toHex,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { useEip1193 } from "../hooks/useEip1193";
import { TEST_CHAINS } from "../constants";
import { TestButton } from "./TestButton";

const BASE_CHAIN_ID = 8453;
const WCHAN_BASE: Address = "0xBa5ED0000e1CA9136a695f0a848012A16008B032";
const ONE_USDC = 1_000_000n; // 6 decimals

const ENS_RECIPIENTS = [
  "apoorv.eth",
  "vitalik.eth",
  "jesse.base.eth",
  "kieran.base.eth",
];

const ETH_RPC_URL =
  process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://eth.llamarpc.com";

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(ETH_RPC_URL),
});

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

  const sendEnsUsdcBatch = async () => {
    if (chainId !== BASE_CHAIN_ID) {
      throw new Error("Switch to Base — this test sends USDC on Base");
    }
    if (!usdc) throw new Error("No USDC config for Base");

    const resolved = await Promise.all(
      ENS_RECIPIENTS.map(async (name) => {
        const addr = await mainnetClient.getEnsAddress({
          name: normalize(name),
        });
        if (!addr) throw new Error(`Failed to resolve ${name}`);
        return { name, address: addr };
      }),
    );

    const calls = resolved.map(({ address: to }) => ({
      to: usdc.address,
      value: "0x0",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, ONE_USDC],
      }),
    }));

    return request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          from: address,
          chainId: chainIdHex,
          atomicRequired: false,
          calls,
        },
      ],
    });
  };

  const sendUsdcSwapBatch = async () => {
    if (chainId !== BASE_CHAIN_ID) {
      throw new Error("Switch to Base — this test uses USDC + WCHAN on Base");
    }
    if (!usdc) throw new Error("No USDC config for Base");

    const params = new URLSearchParams({
      sellToken: usdc.address,
      buyToken: WCHAN_BASE,
      sellAmount: ONE_USDC.toString(),
      taker: address,
      chainId: String(BASE_CHAIN_ID),
    });
    const res = await fetch(`/api/swap/quote?${params.toString()}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error || data.reason || `Quote API ${res.status}`,
      );
    }
    const quote = (await res.json()) as {
      transaction?: { to: string; data: string; value: string };
      allowanceTarget?: string;
      issues?: { allowance?: { spender?: string } };
    };
    if (!quote.transaction?.to || !quote.transaction.data) {
      throw new Error("Quote missing transaction data");
    }
    const spender = (quote.issues?.allowance?.spender ??
      quote.allowanceTarget) as Address | undefined;
    if (!spender) throw new Error("Quote missing allowance spender");

    const approve = (amount: bigint) => ({
      to: usdc.address,
      value: "0x0",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
      }),
    });

    return request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          from: address,
          chainId: chainIdHex,
          atomicRequired: true,
          calls: [
            approve(ONE_USDC),
            {
              to: quote.transaction.to,
              value: toHex(BigInt(quote.transaction.value || "0")),
              data: quote.transaction.data,
            },
            approve(0n),
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
        label="Send 1 USDC to 4 ENS names (Base)"
        description="Resolves apoorv.eth, vitalik.eth, jesse.base.eth, kieran.base.eth and batches 4× USDC.transfer(recipient, 1 USDC). Base only."
        onRun={sendEnsUsdcBatch}
        isDisabled={chainId !== BASE_CHAIN_ID || !usdc}
      />
      <TestButton
        label="USDC → WCHAN swap (3-call batch)"
        description="approve(spender, 1 USDC) → swap 1 USDC → WCHAN via 0x → approve(spender, 0). Base only."
        onRun={sendUsdcSwapBatch}
        isDisabled={chainId !== BASE_CHAIN_ID || !usdc}
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
