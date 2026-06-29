import {
  decodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";

export type { Address, Hex };

export const TEST_ERC7710_DELEGATE: Address =
  "0x1111111111111111111111111111111111111111";
export const TEST_ERC7715_ASSET_CHANGE_RECIPIENT: Address =
  "0x63A556c75443b176b5A4078e929e38bEb37a1ff2";

const SINGLE_DEFAULT_EXECUTION_MODE: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const VISIBLE_ERC20_CONSUME_AMOUNT = 10_000n; // 0.01 USDC for 6-decimal test tokens.
const VISIBLE_NATIVE_CONSUME_AMOUNT = 1_000_000_000_000n; // 0.000001 ETH.

const DELEGATION_CONTEXT_ABI = [
  {
    name: "delegations",
    type: "tuple[]",
    components: [
      { name: "delegate", type: "address" },
      { name: "delegator", type: "address" },
      { name: "authority", type: "bytes32" },
      {
        name: "caveats",
        type: "tuple[]",
        components: [
          { name: "enforcer", type: "address" },
          { name: "terms", type: "bytes" },
          { name: "args", type: "bytes" },
        ],
      },
      { name: "salt", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
  },
] as const;

const DELEGATION_MANAGER_REDEEM_ABI = [
  {
    type: "function",
    name: "redeemDelegations",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_permissionContexts", type: "bytes[]" },
      { name: "_modes", type: "bytes32[]" },
      { name: "_executionCallDatas", type: "bytes[]" },
    ],
    outputs: [],
  },
] as const;

export type Erc7715PermissionResponse = {
  chainId: Hex;
  from: Address;
  to: Address;
  permission: {
    type: string;
    isAdjustmentAllowed: boolean;
    justification?: string;
    data: Record<string, unknown>;
  };
  rules?: { type: string; data: Record<string, unknown> }[];
  context: Hex;
  dependencies: { factory: Hex; factoryData: Hex }[];
  delegationManager: Address;
};

export type DecodedDelegation = {
  delegate: Address;
  delegator: Address;
  authority: Hex;
  caveats: { enforcer: Address; terms: Hex; args: Hex }[];
  salt: bigint;
  signature: Hex;
};

type Execution = {
  target: Address;
  value: bigint;
  callData: Hex;
};

export function stringifyForDisplay(value: unknown): string {
  if (value === undefined) return "(no return value)";
  if (typeof value === "string") return value;
  return JSON.stringify(
    value,
    (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested),
    2,
  );
}

function isHex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]*$/iu.test(value);
}

function isAddressValue(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value);
}

function parseHexQuantity(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function boundedVisibleAmount(
  data: Record<string, unknown>,
  fields: string[],
  fallback: bigint,
): bigint {
  for (const field of fields) {
    const parsed = parseHexQuantity(data[field]);
    if (parsed && parsed > 0n) {
      return parsed < fallback ? parsed : fallback;
    }
  }
  return fallback;
}

function isPermissionResponse(value: unknown): value is Erc7715PermissionResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<Erc7715PermissionResponse>;
  return (
    isHex(candidate.chainId) &&
    isAddressValue(candidate.from) &&
    isAddressValue(candidate.to) &&
    !!candidate.permission &&
    typeof candidate.permission === "object" &&
    isHex(candidate.context) &&
    isAddressValue(candidate.delegationManager)
  );
}

export function extractPermissionResponses(
  value: unknown,
): Erc7715PermissionResponse[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPermissionResponse).map((response) => ({
    ...response,
    from: getAddress(response.from),
    to: getAddress(response.to),
    delegationManager: getAddress(response.delegationManager),
  }));
}

export function decodePermissionContext(context: string): DecodedDelegation[] {
  if (!isHex(context)) throw new Error("Permission context must be hex");
  const [delegations] = decodeAbiParameters(
    DELEGATION_CONTEXT_ABI,
    context,
  ) as unknown as [DecodedDelegation[]];
  return delegations.map((delegation) => ({
    ...delegation,
    delegate: getAddress(delegation.delegate),
    delegator: getAddress(delegation.delegator),
    caveats: delegation.caveats.map((caveat) => ({
      ...caveat,
      enforcer: getAddress(caveat.enforcer),
    })),
  }));
}

export function encodeSingleExecution(execution: Execution): Hex {
  return encodePacked(
    ["address", "uint256", "bytes"],
    [execution.target, execution.value, execution.callData],
  );
}

export function encodeRedeemDelegationsCalldata({
  context,
  execution,
}: {
  context: Hex;
  execution: Execution;
}): Hex {
  return encodeFunctionData({
    abi: DELEGATION_MANAGER_REDEEM_ABI,
    functionName: "redeemDelegations",
    args: [
      [context],
      [SINGLE_DEFAULT_EXECUTION_MODE],
      [encodeSingleExecution(execution)],
    ],
  });
}

export function buildVisibleAssetChangeExecution(
  response: Erc7715PermissionResponse,
): Execution {
  const permissionType = response.permission.type;
  const data = response.permission.data;

  if (permissionType.startsWith("erc20-token-")) {
    const tokenAddress = data.tokenAddress;
    if (typeof tokenAddress !== "string" || !isAddress(tokenAddress)) {
      throw new Error("Permission response has no valid token address.");
    }

    const amount = boundedVisibleAmount(
      data,
      ["allowanceAmount", "periodAmount", "maxAmount", "initialAmount"],
      VISIBLE_ERC20_CONSUME_AMOUNT,
    );

    return {
      target: getAddress(tokenAddress),
      value: 0n,
      callData: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [TEST_ERC7715_ASSET_CHANGE_RECIPIENT, amount],
      }),
    };
  }

  if (permissionType.startsWith("native-token-")) {
    return {
      target: TEST_ERC7715_ASSET_CHANGE_RECIPIENT,
      value: boundedVisibleAmount(
        data,
        ["allowanceAmount", "periodAmount", "maxAmount", "initialAmount"],
        VISIBLE_NATIVE_CONSUME_AMOUNT,
      ),
      callData: "0x",
    };
  }

  throw new Error("Consume helper supports native and ERC-20 transfer grants");
}
