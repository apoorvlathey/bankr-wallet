"use client";

import { Text } from "@chakra-ui/react";
import { useEip1193 } from "../hooks/useEip1193";
import { TestButton } from "./TestButton";

export function ConnectSection() {
  const request = useEip1193();

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
        label="eth_requestAccounts"
        description="Request account access (silent if already connected)."
        onRun={() => request({ method: "eth_requestAccounts" })}
      />
      <TestButton
        label="eth_accounts"
        description="Return currently authorized accounts."
        onRun={() => request({ method: "eth_accounts" })}
      />
      <TestButton
        label="eth_chainId"
        description="Return active chain id as 0x-prefixed hex."
        onRun={() => request({ method: "eth_chainId" })}
      />
      <TestButton
        label="net_version"
        description="Return active chain id as a decimal string."
        onRun={() => request({ method: "net_version" })}
      />
      <TestButton
        label="wallet_getPermissions"
        description="List granted dapp permissions (EIP-2255)."
        onRun={() => request({ method: "wallet_getPermissions" })}
      />
      <TestButton
        label="wallet_requestPermissions: eth_accounts"
        description="Request eth_accounts permission — should re-open connect flow."
        onRun={() =>
          request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          })
        }
      />
    </>
  );
}
