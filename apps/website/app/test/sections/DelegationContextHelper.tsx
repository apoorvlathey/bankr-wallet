"use client";

import {
  Box,
  Button,
  Code,
  HStack,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { TestButton } from "./TestButton";
import {
  TEST_ERC7715_ASSET_CHANGE_RECIPIENT,
  buildVisibleAssetChangeExecution,
  decodePermissionContext,
  encodeRedeemDelegationsCalldata,
  stringifyForDisplay,
  type Erc7715PermissionResponse,
} from "./erc7715TestUtils";

type RpcRequest = (args: {
  method: string;
  params?: readonly unknown[] | Record<string, unknown>;
}) => Promise<unknown>;

type DelegationContextHelperProps = {
  selectedResponse: Erc7715PermissionResponse | null;
  contextDraft: string;
  onContextDraftChange: (value: string) => void;
  delegationManagerDraft: string;
  onDelegationManagerDraftChange: (value: string) => void;
  address: Address;
  chainId: number;
  request: RpcRequest;
};

type CopiedTarget = "context" | "delegation" | null;

function asHex(value: string, label: string): Hex {
  const trimmed = value.trim();
  if (!/^0x[0-9a-f]*$/iu.test(trimmed)) {
    throw new Error(`${label} must be hex`);
  }
  return trimmed as Hex;
}

function chainIdFromHex(value: Hex): number {
  return Number(BigInt(value));
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function DelegationContextHelper({
  selectedResponse,
  contextDraft,
  onContextDraftChange,
  delegationManagerDraft,
  onDelegationManagerDraftChange,
  address,
  chainId,
  request,
}: DelegationContextHelperProps) {
  const [copied, setCopied] = useState<CopiedTarget>(null);

  const decoded = useMemo(() => {
    if (!contextDraft.trim()) {
      return { delegations: [], text: "", error: null as string | null };
    }
    try {
      const delegations = decodePermissionContext(contextDraft.trim());
      return {
        delegations,
        text: stringifyForDisplay(delegations),
        error: null as string | null,
      };
    } catch (error) {
      return {
        delegations: [],
        text: "",
        error:
          error instanceof Error
            ? error.message
            : "Could not decode permission context",
      };
    }
  }, [contextDraft]);

  const copyValue = async (target: Exclude<CopiedTarget, null>, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(target);
    window.setTimeout(() => setCopied(null), 2000);
  };

  const getValidatedDelegationInputs = () => {
    const response = selectedResponse;
    if (!response) {
      throw new Error("Run or fetch a permission response before consuming it");
    }
    const context = asHex(contextDraft, "Permission context");
    const delegationManager = delegationManagerDraft.trim();
    if (!isAddress(delegationManager)) {
      throw new Error("DelegationManager must be an address");
    }
    if (chainIdFromHex(response.chainId) !== chainId) {
      throw new Error("Switch to the permission response chain before consuming");
    }
    const [delegation] = decodePermissionContext(context);
    if (!delegation) throw new Error("Permission context has no delegation");
    if (delegation.delegate.toLowerCase() !== address.toLowerCase()) {
      throw new Error(
        `Connected account is not the delegate (${delegation.delegate}). Run the self-delegate consume grant first.`,
      );
    }

    return {
      response,
      context,
      delegationManager: getAddress(delegationManager),
    };
  };

  const consumeSelectedPermission = () => {
    const { response, context, delegationManager } =
      getValidatedDelegationInputs();

    return request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          to: delegationManager,
          value: "0x0",
          data: encodeRedeemDelegationsCalldata({
            context,
            execution: buildVisibleAssetChangeExecution(response),
          }),
        },
      ],
    });
  };

  const consumeNativeWithArbitraryCalldata = () => {
    const { response, context, delegationManager } =
      getValidatedDelegationInputs();
    if (!response.permission.type.startsWith("native-token-")) {
      throw new Error("Load a native-token self-delegate grant first");
    }

    return request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          to: delegationManager,
          value: "0x0",
          data: encodeRedeemDelegationsCalldata({
            context,
            execution: {
              target: response.from,
              value: 0n,
              callData: "0xdeadbeef",
            },
          }),
        },
      ],
    });
  };

  const consumeErc20WithNativeValue = () => {
    const { response, context, delegationManager } =
      getValidatedDelegationInputs();
    if (!response.permission.type.startsWith("erc20-token-")) {
      throw new Error("Load an ERC-20 self-delegate grant first");
    }
    const tokenAddress = response.permission.data.tokenAddress;
    if (typeof tokenAddress !== "string" || !isAddress(tokenAddress)) {
      throw new Error("Selected permission does not contain a token address");
    }

    return request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          to: delegationManager,
          value: "0x1",
          data: encodeRedeemDelegationsCalldata({
            context,
            execution: {
              target: getAddress(tokenAddress),
              value: 1n,
              callData: encodeFunctionData({
                abi: erc20Abi,
                functionName: "transfer",
                args: [response.from, 0n],
              }),
            },
          }),
        },
      ],
    });
  };

  return (
    <>
      <VStack
        align="stretch"
        spacing={2}
        p={3}
        bg="gray.50"
        border="2px solid"
        borderColor="bauhaus.black"
      >
        <HStack justify="space-between" align="flex-start" spacing={3}>
          <Box flex={1}>
            <Text
              fontSize="sm"
              fontWeight="900"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              Permission context helper
            </Text>
            <Text fontSize="xs" color="gray.600" fontWeight="500">
              Captures the last returned permission context, decodes the delegation, and can submit a visible redeem call to {shortAddress(TEST_ERC7715_ASSET_CHANGE_RECIPIENT)}.
            </Text>
          </Box>
          {selectedResponse && (
            <Code
              fontSize="2xs"
              bg="white"
              border="1px solid"
              borderColor="gray.300"
            >
              {selectedResponse.permission.type}
            </Code>
          )}
        </HStack>

        <Input
          size="sm"
          value={delegationManagerDraft}
          onChange={(event) => onDelegationManagerDraftChange(event.target.value)}
          placeholder="DelegationManager address"
          fontFamily="mono"
          bg="white"
        />
        <Textarea
          value={contextDraft}
          onChange={(event) => onContextDraftChange(event.target.value)}
          placeholder="Permission context hex"
          fontFamily="mono"
          fontSize="xs"
          bg="white"
          minH="88px"
        />

        <HStack spacing={2} flexWrap="wrap">
          <Button
            size="xs"
            variant="outline"
            onClick={() => copyValue("context", contextDraft)}
            isDisabled={!contextDraft}
          >
            {copied === "context" ? "Copied" : "Copy context"}
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => copyValue("delegation", decoded.text)}
            isDisabled={!decoded.text}
          >
            {copied === "delegation" ? "Copied" : "Copy decoded"}
          </Button>
        </HStack>

        {decoded.error ? (
          <Text fontSize="xs" color="red.600" fontWeight="700">
            {decoded.error}
          </Text>
        ) : decoded.text ? (
          <Box
            bg="white"
            border="1px solid"
            borderColor="gray.300"
            p={2}
            maxH="180px"
            overflowY="auto"
          >
            <Code
              display="block"
              whiteSpace="pre-wrap"
              wordBreak="break-all"
              bg="transparent"
              p={0}
              fontSize="xs"
            >
              {decoded.text}
            </Code>
          </Box>
        ) : (
          <Text fontSize="xs" color="gray.500" fontWeight="600">
            No permission context loaded yet.
          </Text>
        )}
      </VStack>

      <TestButton
        label="Consume selected context"
        description={`Submits DelegationManager.redeemDelegations with a small visible native or ERC-20 transfer to ${shortAddress(TEST_ERC7715_ASSET_CHANGE_RECIPIENT)}. Use the self-delegate grant for the feasible path from this page.`}
        onRun={consumeSelectedPermission}
        isDisabled={
          !contextDraft ||
          !delegationManagerDraft ||
          decoded.delegations.length === 0
        }
      />
      <TestButton
        label="Negative consume: native calldata"
        description="Uses a native self-delegate context but attempts redeemDelegations with non-empty calldata. ExactCalldataEnforcer should block it."
        onRun={consumeNativeWithArbitraryCalldata}
        isDisabled={
          !contextDraft ||
          !delegationManagerDraft ||
          decoded.delegations.length === 0 ||
          !selectedResponse?.permission.type.startsWith("native-token-")
        }
        variant="outline"
      />
      <TestButton
        label="Negative consume: ERC-20 native value"
        description="Uses an ERC-20 self-delegate context but attempts redeemDelegations with 1 wei of native value. ValueLteEnforcer(0) should block it."
        onRun={consumeErc20WithNativeValue}
        isDisabled={
          !contextDraft ||
          !delegationManagerDraft ||
          decoded.delegations.length === 0 ||
          !selectedResponse?.permission.type.startsWith("erc20-token-")
        }
        variant="outline"
      />
    </>
  );
}
