"use client";

import { Text } from "@chakra-ui/react";
import { useAccount, useChainId } from "wagmi";
import { toHex } from "viem";
import { useEip1193 } from "../hooks/useEip1193";
import {
  MAIL_TYPED_DATA,
  PERMIT_TYPES,
  TEST_CHAINS,
  USDC_PERMIT_DOMAIN,
} from "../constants";
import { TestButton } from "./TestButton";

const PERMIT_SPENDER = "0x0000000000000000000000000000000000000001";

export function SignatureSection() {
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

  const personalSign = () =>
    request({
      method: "personal_sign",
      params: [toHex("Hello WalletChan — personal_sign test"), address],
    });

  const personalSignRawHex = () =>
    request({
      method: "personal_sign",
      params: ["0xdeadbeef", address],
    });

  const ethSign = () =>
    request({
      method: "eth_sign",
      params: [
        address,
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      ],
    });

  const signMail = () =>
    request({
      method: "eth_signTypedData_v4",
      params: [
        address,
        JSON.stringify({
          domain: MAIL_TYPED_DATA.domain,
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            ...MAIL_TYPED_DATA.types,
          },
          primaryType: MAIL_TYPED_DATA.primaryType,
          message: MAIL_TYPED_DATA.message,
        }),
      ],
    });

  const signPermit = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    return request({
      method: "eth_signTypedData_v4",
      params: [
        address,
        JSON.stringify({
          domain: USDC_PERMIT_DOMAIN(chainId, usdc.address),
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            Permit: PERMIT_TYPES.Permit,
          },
          primaryType: "Permit",
          message: {
            owner: address,
            spender: PERMIT_SPENDER,
            value: "1000000",
            nonce: "0",
            deadline: deadline.toString(),
          },
        }),
      ],
    });
  };

  return (
    <>
      <TestButton
        label="personal_sign (text)"
        description="Signs a human-readable string after EIP-191 prefix."
        onRun={personalSign}
      />
      <TestButton
        label="personal_sign (raw hex)"
        description="Signs 0xdeadbeef — exercises raw-hex preview."
        onRun={personalSignRawHex}
      />
      <TestButton
        label="eth_sign (deprecated)"
        description="Legacy raw 32-byte sign. Many wallets reject — ours should handle or warn."
        onRun={ethSign}
        variant="outline"
      />
      <TestButton
        label="eth_signTypedData_v4 — Mail"
        description="Toy EIP-712 payload from the spec (generic struct)."
        onRun={signMail}
      />
      <TestButton
        label={`eth_signTypedData_v4 — USDC Permit (${chain?.name ?? "…"})`}
        description="Realistic EIP-2612 Permit payload. Exercises domain + nonce + deadline UI."
        onRun={signPermit}
        isDisabled={!usdc}
      />
    </>
  );
}
