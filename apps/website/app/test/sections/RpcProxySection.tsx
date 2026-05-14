"use client";

import { Input, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useEip1193 } from "../hooks/useEip1193";
import { TestButton } from "./TestButton";

export function RpcProxySection() {
  const request = useEip1193();
  const { address } = useAccount();
  const [txHash, setTxHash] = useState("");

  if (!request) {
    return (
      <Text fontSize="sm" color="gray.500">
        Connect a wallet to enable these tests.
      </Text>
    );
  }

  return (
    <>
      <TestButton
        label="eth_blockNumber"
        description="Latest block. Silent proxy through wallet's RPC."
        onRun={() => request({ method: "eth_blockNumber" })}
      />
      <TestButton
        label="eth_gasPrice"
        description="Current gas price (legacy)."
        onRun={() => request({ method: "eth_gasPrice" })}
      />
      <TestButton
        label="eth_maxPriorityFeePerGas"
        description="EIP-1559 priority fee estimate."
        onRun={() => request({ method: "eth_maxPriorityFeePerGas" })}
      />
      <TestButton
        label="eth_getBalance (self, latest)"
        description="Native balance of the connected account."
        onRun={() => {
          if (!address) throw new Error("Not connected");
          return request({
            method: "eth_getBalance",
            params: [address, "latest"],
          });
        }}
        isDisabled={!address}
      />
      <TestButton
        label="eth_feeHistory (4 blocks)"
        description="Recent fee distribution — exercises complex array param."
        onRun={() =>
          request({
            method: "eth_feeHistory",
            params: ["0x4", "latest", [25, 50, 75]],
          })
        }
      />
      <TestButton
        label="eth_getTransactionReceipt"
        description="Receipt by tx hash. Paste any tx hash from the active chain."
        onRun={() => {
          const h = txHash.trim();
          if (!h) throw new Error("Enter a tx hash first");
          return request({
            method: "eth_getTransactionReceipt",
            params: [h],
          });
        }}
      >
        <Input
          size="sm"
          placeholder="0x…"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          fontFamily="mono"
          fontSize="xs"
          borderRadius={0}
          border="2px solid"
          borderColor="bauhaus.black"
          _focus={{ boxShadow: "none", borderColor: "bauhaus.blue" }}
        />
      </TestButton>
      <TestButton
        label="web3_clientVersion"
        description="Node client version string."
        onRun={() => request({ method: "web3_clientVersion" })}
        variant="outline"
      />
    </>
  );
}
