"use client";

import { Box, Button, Code, HStack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  toHex,
  type Address,
  type Hex,
} from "viem";
import { TEST_CHAINS } from "../constants";
import { useEip1193 } from "../hooks/useEip1193";
import { DelegationContextHelper } from "./DelegationContextHelper";
import { TestButton } from "./TestButton";
import {
  TEST_ERC7710_DELEGATE,
  TEST_ERC7715_ASSET_CHANGE_RECIPIENT,
  buildVisibleAssetChangeExecution,
  decodePermissionContext,
  encodeRedeemDelegationsCalldata,
  extractPermissionResponses,
  stringifyForDisplay,
  type Erc7715PermissionResponse,
} from "./erc7715TestUtils";

const ONE_HOUR_SECONDS = 3600;
const ONE_DAY_SECONDS = 86400;
const ONE_USDC_HEX = "0xf4240";
const NATIVE_0_001_ETH_HEX = "0x38d7ea4c68000";
const ROOT_AUTHORITY =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const DELEGATION_MANAGER = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";

type PermissionPayload = {
  chainId: Hex;
  from: Address;
  to: Address;
  permission: {
    type: string;
    isAdjustmentAllowed: boolean;
    justification?: string;
    data: Record<string, unknown>;
  };
  rules?: { type: "expiry"; data: { timestamp: number } }[];
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function expiryRule(seconds = ONE_HOUR_SECONDS) {
  return [
    { type: "expiry" as const, data: { timestamp: nowSeconds() + seconds } },
  ];
}

function chainIdFromHex(value: Hex): number {
  return Number(BigInt(value));
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getConsumeBlockReason({
  response,
  address,
  chainId,
}: {
  response: Erc7715PermissionResponse;
  address: Address;
  chainId: number;
}): string | null {
  if (chainIdFromHex(response.chainId) !== chainId) {
    return "Switch to the permission response chain before consuming.";
  }

  if (
    !response.permission.type.startsWith("native-token-") &&
    !response.permission.type.startsWith("erc20-token-")
  ) {
    return "This consume helper only supports native and ERC-20 transfer permissions.";
  }

  try {
    const [delegation] = decodePermissionContext(response.context);
    if (!delegation) return "Permission context has no delegation.";
    if (delegation.delegate.toLowerCase() !== address.toLowerCase()) {
      return `Delegate is ${shortAddress(delegation.delegate)}. Use a self-delegate request to consume from this page.`;
    }
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Could not decode permission context.";
  }

  return null;
}

type RpcRequest = (args: {
  method: string;
  params?: readonly unknown[] | Record<string, unknown>;
}) => Promise<unknown>;

function InlineConsumePermissionAction({
  value,
  address,
  chainId,
  request,
  onLoadResponse,
}: {
  value: unknown;
  address: Address;
  chainId: number;
  request: RpcRequest;
  onLoadResponse: (response: Erc7715PermissionResponse) => void;
}) {
  const response = extractPermissionResponses(value)[0];
  const [status, setStatus] = useState<"idle" | "pending" | "ok" | "error">(
    "idle",
  );
  const [result, setResult] = useState<string | null>(null);

  if (!response) return null;

  const blockReason = getConsumeBlockReason({ response, address, chainId });

  const consumeReturnedContext = async () => {
    const reason = getConsumeBlockReason({ response, address, chainId });
    if (reason) throw new Error(reason);

    onLoadResponse(response);
    return request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          to: response.delegationManager,
          value: "0x0",
          data: encodeRedeemDelegationsCalldata({
            context: response.context,
            execution: buildVisibleAssetChangeExecution(response),
          }),
        },
      ],
    });
  };

  const handleConsume = async () => {
    setStatus("pending");
    setResult(null);
    try {
      const txResult = await consumeReturnedContext();
      setResult(stringifyForDisplay(txResult));
      setStatus("ok");
    } catch (error) {
      setResult(
        error instanceof Error
          ? error.message
          : stringifyForDisplay(error),
      );
      setStatus("error");
    }
  };

  return (
    <Box
      bg="gray.50"
      border="2px solid"
      borderColor="bauhaus.black"
      p={2}
    >
      <HStack justify="space-between" align="center" spacing={3}>
        <Box minW={0}>
          <Text fontSize="xs" fontWeight="900" textTransform="uppercase">
            Returned delegation context
          </Text>
          <Text fontSize="xs" color="gray.600" fontWeight="600">
            {blockReason ||
              `Ready to submit a visible redeem call to ${shortAddress(TEST_ERC7715_ASSET_CHANGE_RECIPIENT)}.`}
          </Text>
        </Box>
        <Button
          size="xs"
          variant="secondary"
          onClick={handleConsume}
          isLoading={status === "pending"}
          isDisabled={!!blockReason}
          flexShrink={0}
        >
          Consume
        </Button>
      </HStack>
      {result && (
        <Code
          display="block"
          whiteSpace="pre-wrap"
          wordBreak="break-all"
          bg={status === "error" ? "red.50" : "white"}
          color={status === "error" ? "red.700" : "bauhaus.black"}
          border="1px solid"
          borderColor={status === "error" ? "red.300" : "gray.300"}
          fontSize="xs"
          mt={2}
          p={2}
        >
          {result}
        </Code>
      )}
    </Box>
  );
}

export function DelegationsSection() {
  const request = useEip1193();
  const { address } = useAccount();
  const chainId = useChainId();
  const chain = TEST_CHAINS[chainId];
  const usdc = chain?.usdc;
  const [selectedResponse, setSelectedResponse] =
    useState<Erc7715PermissionResponse | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [delegationManagerDraft, setDelegationManagerDraft] = useState("");

  if (!request || !address) {
    return (
      <Text fontSize="sm" color="gray.500">
        Connect a wallet to enable these tests.
      </Text>
    );
  }

  const capturePermissionResponses = (value: unknown) => {
    const responses = extractPermissionResponses(value);
    const first = responses[0];
    if (!first) return;
    loadPermissionResponse(first);
  };

  const loadPermissionResponse = (response: Erc7715PermissionResponse) => {
    setSelectedResponse(response);
    setContextDraft(response.context);
    setDelegationManagerDraft(response.delegationManager);
  };

  const renderDelegationResultActions = ({
    value,
    status,
  }: {
    value: unknown;
    status: "idle" | "pending" | "ok" | "error";
  }) => {
    if (status !== "ok") return null;
    return (
      <InlineConsumePermissionAction
        value={value}
        address={address}
        chainId={chainId}
        request={request}
        onLoadResponse={loadPermissionResponse}
      />
    );
  };

  const runPermissionRequest = async (payload: PermissionPayload) => {
    const value = await request({
      method: "wallet_requestExecutionPermissions",
      params: [payload],
    });
    capturePermissionResponses(value);
    return value;
  };

  const basePayload = (
    permission: PermissionPayload["permission"],
    rules: PermissionPayload["rules"] | null = expiryRule(),
    delegate: Address = TEST_ERC7710_DELEGATE,
  ): PermissionPayload => ({
    chainId: toHex(chainId),
    from: address,
    to: delegate,
    permission,
    ...(rules ? { rules } : {}),
  });

  const getSupportedExecutionPermissions = () =>
    request({
      method: "wallet_getSupportedExecutionPermissions",
      params: [],
    });

  const getGrantedExecutionPermissions = async () => {
    const value = await request({
      method: "wallet_getGrantedExecutionPermissions",
      params: [],
    });
    capturePermissionResponses(value);
    return value;
  };

  const requestRawErc7710DelegationSignature = () =>
    request({
      method: "eth_signTypedData_v4",
      params: [
        address,
        {
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            Delegation: [
              { name: "delegate", type: "address" },
              { name: "delegator", type: "address" },
              { name: "authority", type: "bytes32" },
              { name: "caveats", type: "Caveat[]" },
              { name: "salt", type: "uint256" },
            ],
            Caveat: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
            ],
          },
          domain: {
            name: "DelegationManager",
            version: "1",
            chainId,
            verifyingContract: DELEGATION_MANAGER,
          },
          primaryType: "Delegation",
          message: {
            delegate: TEST_ERC7710_DELEGATE,
            delegator: address,
            authority: ROOT_AUTHORITY,
            caveats: [],
            salt: "1",
          },
        },
      ],
    });

  const requestNativeAllowance = () =>
    runPermissionRequest(
      basePayload({
        type: "native-token-allowance",
        isAdjustmentAllowed: true,
        data: {
          allowanceAmount: NATIVE_0_001_ETH_HEX,
          startTime: nowSeconds(),
        },
      }),
    );

  const requestNativeSelfDelegateAllowance = () =>
    runPermissionRequest(
      basePayload(
        {
          type: "native-token-allowance",
          isAdjustmentAllowed: true,
          data: {
            allowanceAmount: NATIVE_0_001_ETH_HEX,
            startTime: nowSeconds(),
          },
        },
        expiryRule(),
        address,
      ),
    );

  const requestConcurrentPermissionLock = async () => {
    const first = requestNativeSelfDelegateAllowance();
    first.catch(() => undefined);

    await new Promise((resolve) => window.setTimeout(resolve, 150));

    try {
      await requestNativeAllowance();
      return {
        secondRejected: false,
        note: "The second permission request was accepted. If the first prompt was still open, this is a lock failure.",
      };
    } catch (error) {
      return {
        secondRejected: true,
        message:
          error instanceof Error ? error.message : "Second request rejected",
        code:
          typeof error === "object" && error !== null && "code" in error
            ? (error as { code?: unknown }).code
            : undefined,
      };
    }
  };

  const requestUsdcAllowance = (delegate = TEST_ERC7710_DELEGATE) => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return runPermissionRequest(
      basePayload(
        {
          type: "erc20-token-allowance",
          isAdjustmentAllowed: true,
          justification:
            "Let the local test delegate spend up to 1 USDC while testing WalletChan's permission review UI.",
          data: {
            tokenAddress: usdc.address,
            allowanceAmount: ONE_USDC_HEX,
            startTime: nowSeconds(),
          },
        },
        expiryRule(),
        delegate,
      ),
    );
  };

  const requestUsdcPeriodic = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return runPermissionRequest(
      basePayload({
        type: "erc20-token-periodic",
        isAdjustmentAllowed: true,
        justification:
          "Let the local test delegate spend 1 USDC per selected period for recurring-payment QA.",
        data: {
          tokenAddress: usdc.address,
          periodAmount: ONE_USDC_HEX,
          periodDuration: ONE_DAY_SECONDS,
          startTime: nowSeconds(),
        },
      }),
    );
  };

  const requestUsdcStream = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return runPermissionRequest(
      basePayload({
        type: "erc20-token-stream",
        isAdjustmentAllowed: true,
        justification:
          "Let the local test delegate stream roughly 1 USDC per day for recurring-payment QA.",
        data: {
          tokenAddress: usdc.address,
          initialAmount: "0x0",
          maxAmount: ONE_USDC_HEX,
          amountPerSecond: "0xc",
          startTime: nowSeconds(),
        },
      }),
    );
  };

  const requestApprovalRevocation = () =>
    runPermissionRequest(
      basePayload({
        type: "token-approval-revocation",
        isAdjustmentAllowed: true,
        justification:
          "Let the local test delegate revoke token approvals during delegated-permission QA.",
        data: {
          erc20Approve: true,
          erc721Approve: true,
          erc721SetApprovalForAll: true,
          permit2Approve: true,
          permit2Lockdown: true,
          permit2InvalidateNonces: false,
        },
      }),
    );

  const requestPermit2NonceInvalidation = () =>
    runPermissionRequest(
      basePayload({
        type: "token-approval-revocation",
        isAdjustmentAllowed: true,
        justification:
          "Negative QA: WalletChan should reject broad Permit2 nonce invalidation until it can be token/spender scoped.",
        data: {
          erc20Approve: false,
          erc721Approve: false,
          erc721SetApprovalForAll: false,
          permit2Approve: false,
          permit2Lockdown: false,
          permit2InvalidateNonces: true,
        },
      }),
    );

  const requestUsdcNoJustification = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return runPermissionRequest(
      basePayload({
        type: "erc20-token-allowance",
        isAdjustmentAllowed: true,
        data: {
          tokenAddress: usdc.address,
          allowanceAmount: ONE_USDC_HEX,
          startTime: nowSeconds(),
        },
      }),
    );
  };

  const requestMalformedTokenAddress = () =>
    runPermissionRequest(
      basePayload({
        type: "erc20-token-allowance",
        isAdjustmentAllowed: true,
        data: {
          tokenAddress: "0x123",
          allowanceAmount: ONE_USDC_HEX,
          startTime: nowSeconds(),
        },
      }),
    );

  const requestUsdcStreamNoExpiry = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return runPermissionRequest(
      basePayload(
        {
          type: "erc20-token-stream",
          isAdjustmentAllowed: true,
          data: {
            tokenAddress: usdc.address,
            initialAmount: "0x0",
            amountPerSecond: "0xc",
            startTime: nowSeconds(),
          },
        },
        null,
      ),
    );
  };

  const requestApprovalRevocationNoExpiry = () =>
    runPermissionRequest(
      basePayload(
        {
          type: "token-approval-revocation",
          isAdjustmentAllowed: true,
          data: {
            erc20Approve: true,
            erc721Approve: false,
            erc721SetApprovalForAll: false,
            permit2Approve: false,
            permit2Lockdown: false,
            permit2InvalidateNonces: false,
          },
        },
        null,
      ),
    );

  const requestAmbiguousJustification = () => {
    if (!usdc) throw new Error(`No USDC on ${chain?.name ?? chainId}`);
    return runPermissionRequest(
      basePayload({
        type: "erc20-token-allowance",
        isAdjustmentAllowed: true,
        justification: "Top-level justification",
        data: {
          tokenAddress: usdc.address,
          allowanceAmount: ONE_USDC_HEX,
          startTime: nowSeconds(),
          justification: "Conflicting nested justification",
        },
      }),
    );
  };

  return (
    <>
      <TestButton
        label="wallet_getSupportedExecutionPermissions"
        description="ERC-7715 discovery call. Returns supported permission types, chains, and rule types."
        onRun={getSupportedExecutionPermissions}
      />
      <TestButton
        label="wallet_getGrantedExecutionPermissions"
        description="Lists active origin/account/chain-scoped permission contexts. The first returned grant is loaded into the helper below."
        onRun={getGrantedExecutionPermissions}
        renderResultActions={renderDelegationResultActions}
      />
      <TestButton
        label="Negative: concurrent permission lock"
        description="Starts one permission prompt, then immediately sends another wallet_requestExecutionPermissions call. The second call should reject with -32002 while the first prompt remains open."
        onRun={requestConcurrentPermissionLock}
        variant="outline"
      />
      <TestButton
        label="Request native allowance"
        description="Native-token allowance with a one-hour expiry and no justification."
        onRun={requestNativeAllowance}
        variant="outline"
        renderResultActions={renderDelegationResultActions}
      />
      <TestButton
        label="Request native self-delegate consume grant"
        description="Native allowance delegated to the connected account so the helper can submit native redeem negative tests."
        onRun={requestNativeSelfDelegateAllowance}
        variant="outline"
        renderResultActions={renderDelegationResultActions}
      />
      <TestButton
        label={`Request USDC allowance (${chain?.name ?? "..."})`}
        description="ERC-20 allowance with one-hour expiry and a site-provided justification."
        onRun={() => requestUsdcAllowance()}
        isDisabled={!usdc}
        variant="outline"
        renderResultActions={renderDelegationResultActions}
      />
      <TestButton
        label="Request USDC periodic"
        description="ERC-20 periodic allowance: 1 USDC per day, expiring in one hour."
        onRun={requestUsdcPeriodic}
        isDisabled={!usdc}
        variant="outline"
        renderResultActions={renderDelegationResultActions}
      />
      <TestButton
        label="Request USDC stream"
        description="ERC-20 stream: roughly 1 USDC per day with a 1 USDC max cap."
        onRun={requestUsdcStream}
        isDisabled={!usdc}
        variant="outline"
        renderResultActions={renderDelegationResultActions}
      />
      <TestButton
        label="Request approval revocation"
        description="Token approval revocation request with ERC-20, NFT, and Permit2 primitives enabled."
        onRun={requestApprovalRevocation}
        variant="outline"
        renderResultActions={renderDelegationResultActions}
      />
      <TestButton
        label="Request USDC self-delegate consume grant"
        description={`Same USDC allowance, but delegates to the connected account so this page can submit a visible redeem call to ${shortAddress(TEST_ERC7715_ASSET_CHANGE_RECIPIENT)}.`}
        onRun={() => requestUsdcAllowance(address)}
        isDisabled={!usdc}
        renderResultActions={renderDelegationResultActions}
      />
      <TestButton
        label="Edge: USDC no justification"
        description="Valid ERC-20 allowance without justification. The wallet should show the explicit missing-state copy."
        onRun={requestUsdcNoJustification}
        isDisabled={!usdc}
        variant="outline"
        renderResultActions={renderDelegationResultActions}
      />
      <TestButton
        label="Negative: malformed token address"
        description="ERC-20 allowance with tokenAddress = 0x123. WalletChan should reject during preflight."
        onRun={requestMalformedTokenAddress}
        variant="outline"
      />
      <TestButton
        label="Negative: raw ERC-7710 signature"
        description="Raw Delegation typed data via eth_signTypedData_v4. WalletChan should reject and require wallet_requestExecutionPermissions."
        onRun={requestRawErc7710DelegationSignature}
        variant="outline"
      />
      <TestButton
        label="Negative: USDC stream no expiry"
        description="Streaming request with unlimited implicit maxAmount and no expiry. WalletChan should reject as unbounded."
        onRun={requestUsdcStreamNoExpiry}
        isDisabled={!usdc}
        variant="outline"
      />
      <TestButton
        label="Negative: revocation no expiry"
        description="Token approval revocation without an expiry rule. WalletChan should reject it."
        onRun={requestApprovalRevocationNoExpiry}
        variant="outline"
      />
      <TestButton
        label="Negative: Permit2 nonce invalidation"
        description="Token approval revocation with permit2InvalidateNonces=true. WalletChan should reject until exact token/spender scoping exists."
        onRun={requestPermit2NonceInvalidation}
        variant="outline"
      />
      <TestButton
        label="Negative: ambiguous justification"
        description="Top-level and nested justification fields disagree. WalletChan should reject the ambiguous request."
        onRun={requestAmbiguousJustification}
        isDisabled={!usdc}
        variant="outline"
      />

      <DelegationContextHelper
        selectedResponse={selectedResponse}
        contextDraft={contextDraft}
        onContextDraftChange={setContextDraft}
        delegationManagerDraft={delegationManagerDraft}
        onDelegationManagerDraftChange={setDelegationManagerDraft}
        address={address}
        chainId={chainId}
        request={request}
      />
    </>
  );
}
