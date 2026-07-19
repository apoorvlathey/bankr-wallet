import {
  concat,
  isAddress,
  pad,
  toHex,
  verifyTypedData,
  type SignedAuthorization,
} from "viem";
import { recoverAuthorizationAddress } from "viem/utils";
import { PIMLICO_FEE_TOKENS_BY_CHAIN_ID } from "./tokens";
export { PIMLICO_FEE_TOKENS_BY_CHAIN_ID, PIMLICO_USDC_BY_CHAIN_ID } from "./tokens";

export const ENTRY_POINT_V07 =
  "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;
export const WALLETCHAN_OFFICIAL_DELEGATE =
  "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B";
const WALLETCHAN_OFFICIAL_DELEGATION_CODE =
  `0xef0100${WALLETCHAN_OFFICIAL_DELEGATE.slice(2)}`.toLowerCase();

export const ALLOWED_PIMLICO_METHODS = new Set([
  "pimlico_getTokenQuotes",
  "pimlico_getUserOperationGasPrice",
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationReceipt",
]);

type RpcEnvelope = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
};

type Hex = `0x${string}`;
type Address = `0x${string}`;

type ProxyUserOperation = {
  sender: Address;
  nonce: Hex;
  callData: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  paymaster?: Address;
  paymasterVerificationGasLimit?: Hex;
  paymasterPostOpGasLimit?: Hex;
  paymasterData?: Hex;
  signature: Hex;
  eip7702Auth?: Record<string, unknown>;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sameAddress(value: unknown, expected: string): boolean {
  return (
    typeof value === "string" &&
    isAddress(value, { strict: true }) &&
    value.toLowerCase() === expected.toLowerCase()
  );
}

function validQuantityHex(value: unknown, maximumBytes = 32): value is Hex {
  return (
    typeof value === "string" &&
    /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value) &&
    value.length <= 2 + maximumBytes * 2
  );
}

function validDataHex(value: unknown, maximumBytes: number): value is Hex {
  return (
    typeof value === "string" &&
    /^0x(?:[0-9a-fA-F]{2})*$/.test(value) &&
    value.length <= 2 + maximumBytes * 2
  );
}

function validUserOperation(value: unknown, chainHex: string): boolean {
  const op = object(value);
  if (
    !op ||
    typeof op.sender !== "string" ||
    !isAddress(op.sender, { strict: true })
  ) {
    return false;
  }
  if (
    !validQuantityHex(op.nonce) ||
    !validDataHex(op.callData, 100_000) ||
    !validQuantityHex(op.callGasLimit, 16) ||
    !validQuantityHex(op.verificationGasLimit, 16) ||
    !validQuantityHex(op.preVerificationGas) ||
    !validQuantityHex(op.maxFeePerGas, 16) ||
    !validQuantityHex(op.maxPriorityFeePerGas, 16) ||
    !validDataHex(op.signature, 2_048)
  ) {
    return false;
  }
  if (op.factory !== undefined || op.factoryData !== undefined) return false;
  if (op.paymaster !== undefined) {
    if (
      typeof op.paymaster !== "string" ||
      !isAddress(op.paymaster, { strict: true }) ||
      !validQuantityHex(op.paymasterVerificationGasLimit, 16) ||
      !validQuantityHex(op.paymasterPostOpGasLimit, 16) ||
      !validDataHex(op.paymasterData, 100_000)
    ) {
      return false;
    }
  } else if (
    op.paymasterVerificationGasLimit !== undefined ||
    op.paymasterPostOpGasLimit !== undefined ||
    op.paymasterData !== undefined
  ) {
    return false;
  }
  if (
    op.eip7702Auth !== undefined &&
    !validEip7702Auth(op.eip7702Auth, chainHex)
  ) {
    return false;
  }
  return true;
}

function validEip7702Auth(value: unknown, chainHex: string): boolean {
  const authorization = object(value);
  return Boolean(
    authorization &&
      sameAddress(authorization.address, WALLETCHAN_OFFICIAL_DELEGATE) &&
      authorization.chainId === chainHex &&
      validQuantityHex(authorization.nonce) &&
      typeof authorization.r === "string" &&
      /^0x[0-9a-fA-F]{64}$/.test(authorization.r) &&
      typeof authorization.s === "string" &&
      /^0x[0-9a-fA-F]{64}$/.test(authorization.s) &&
      (authorization.yParity === "0x0" || authorization.yParity === "0x1") &&
      (authorization.v === undefined ||
        authorization.v === "0x0" ||
        authorization.v === "0x1" ||
        authorization.v === "0x1b" ||
        authorization.v === "0x1c"),
  );
}

function validFreshAccountStateOverride(
  value: unknown,
  userOperation: unknown,
): boolean {
  const operation = object(userOperation);
  const override = object(value);
  if (!operation || !operation.eip7702Auth || !override) return false;
  const entries = Object.entries(override);
  if (entries.length !== 1) return false;
  const [address, accountOverrideValue] = entries[0]!;
  if (
    typeof operation.sender !== "string" ||
    !sameAddress(address, operation.sender)
  ) {
    return false;
  }
  const accountOverride = object(accountOverrideValue);
  if (!accountOverride || Object.keys(accountOverride).length !== 1) return false;
  return (
    typeof accountOverride.code === "string" &&
    accountOverride.code.toLowerCase() === WALLETCHAN_OFFICIAL_DELEGATION_CODE
  );
}

function quantity(value: Hex, label: string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} is not a valid quantity`);
  }
}

function uint128(value: Hex, label: string): Hex {
  const parsed = quantity(value, label);
  if (parsed >= 1n << 128n) throw new Error(`${label} exceeds uint128`);
  return pad(toHex(parsed), { size: 16 });
}

const SIGNABLE_USER_OPERATION_TYPES = {
  PackedUserOperation: [
    { name: "sender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "initCode", type: "bytes" },
    { name: "callData", type: "bytes" },
    { name: "accountGasLimits", type: "bytes32" },
    { name: "preVerificationGas", type: "uint256" },
    { name: "gasFees", type: "bytes32" },
    { name: "paymasterAndData", type: "bytes" },
    { name: "entryPoint", type: "address" },
  ],
} as const;

export function getUserOperationTypedData(op: ProxyUserOperation, chainId: number) {
  let paymasterAndData: Hex = "0x";
  if (op.paymaster) {
    paymasterAndData = concat([
      op.paymaster,
      uint128(
        op.paymasterVerificationGasLimit ?? "0x0",
        "paymasterVerificationGasLimit",
      ),
      uint128(
        op.paymasterPostOpGasLimit ?? "0x0",
        "paymasterPostOpGasLimit",
      ),
      op.paymasterData ?? "0x",
    ]);
  }
  return {
    domain: {
      chainId,
      name: "EIP7702StatelessDeleGator",
      version: "1",
      verifyingContract: op.sender,
    },
    types: SIGNABLE_USER_OPERATION_TYPES,
    primaryType: "PackedUserOperation" as const,
    message: {
      sender: op.sender,
      nonce: quantity(op.nonce, "nonce"),
      initCode: "0x" as Hex,
      callData: op.callData,
      accountGasLimits: concat([
        uint128(op.verificationGasLimit, "verificationGasLimit"),
        uint128(op.callGasLimit, "callGasLimit"),
      ]),
      preVerificationGas: quantity(
        op.preVerificationGas,
        "preVerificationGas",
      ),
      gasFees: concat([
        uint128(op.maxPriorityFeePerGas, "maxPriorityFeePerGas"),
        uint128(op.maxFeePerGas, "maxFeePerGas"),
      ]),
      paymasterAndData,
      entryPoint: ENTRY_POINT_V07,
    },
  };
}

export async function verifyPimlicoSendEnvelope(
  envelope: RpcEnvelope,
  chainId: number,
): Promise<boolean> {
  if (envelope.method !== "eth_sendUserOperation") return true;
  const op = envelope.params[0] as ProxyUserOperation;
  if (!/^0x[0-9a-fA-F]{130}$/.test(op.signature)) return false;
  if (op.eip7702Auth) {
    try {
      const authorization = op.eip7702Auth;
      const authorizationChainId = quantity(
        authorization.chainId as Hex,
        "authorization chain",
      );
      const authorizationNonce = quantity(
        authorization.nonce as Hex,
        "authorization nonce",
      );
      if (
        authorizationChainId !== BigInt(chainId) ||
        authorizationNonce > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        return false;
      }
      const signer = await recoverAuthorizationAddress({
        authorization: {
          address: authorization.address as Address,
          chainId,
          nonce: Number(authorizationNonce),
          r: authorization.r as Hex,
          s: authorization.s as Hex,
          yParity: Number(
            quantity(authorization.yParity as Hex, "authorization parity"),
          ),
        } as SignedAuthorization,
      });
      if (signer.toLowerCase() !== op.sender.toLowerCase()) return false;
    } catch {
      return false;
    }
  }
  try {
    return await verifyTypedData({
      address: op.sender,
      ...getUserOperationTypedData(op, chainId),
      signature: op.signature,
    });
  } catch {
    return false;
  }
}

export function parsePimlicoProxyEnvelope(
  value: unknown,
  chainId: number,
): { ok: true; envelope: RpcEnvelope } | { ok: false; error: string } {
  const envelope = object(value);
  if (
    !envelope ||
    envelope.jsonrpc !== "2.0" ||
    !Number.isSafeInteger(envelope.id) ||
    (envelope.id as number) < 0 ||
    typeof envelope.method !== "string" ||
    !ALLOWED_PIMLICO_METHODS.has(envelope.method) ||
    !Array.isArray(envelope.params)
  ) {
    return { ok: false, error: "Invalid Pimlico JSON-RPC envelope" };
  }
  const feeTokens = PIMLICO_FEE_TOKENS_BY_CHAIN_ID[chainId];
  if (!feeTokens?.length) return { ok: false, error: "Unsupported gas-payment chain" };
  const isAllowedFeeToken = (value: unknown) =>
    feeTokens.some((token) => sameAddress(value, token));
  const params = envelope.params;
  const chainHex = `0x${chainId.toString(16)}`;

  switch (envelope.method) {
    case "pimlico_getUserOperationGasPrice":
      if (params.length !== 0) {
        return { ok: false, error: "Gas-price request must have no params" };
      }
      break;
    case "pimlico_getTokenQuotes": {
      const context = object(params[0]);
      if (
        params.length !== 3 ||
        !context ||
        !Array.isArray(context.tokens) ||
        context.tokens.length !== 1 ||
        !isAllowedFeeToken(context.tokens[0]) ||
        !sameAddress(params[1], ENTRY_POINT_V07) ||
        params[2] !== chainHex
      ) {
        return { ok: false, error: "Invalid fee-token quote request" };
      }
      break;
    }
    case "pm_getPaymasterStubData":
    case "pm_getPaymasterData": {
      const context = object(params[3]);
      if (
        params.length !== 4 ||
        !validUserOperation(params[0], chainHex) ||
        !sameAddress(params[1], ENTRY_POINT_V07) ||
        params[2] !== chainHex ||
        !context ||
        !isAllowedFeeToken(context.token)
      ) {
        return { ok: false, error: "Invalid fee-token paymaster request" };
      }
      break;
    }
    case "eth_estimateUserOperationGas":
      if (
        (params.length !== 2 && params.length !== 3) ||
        !validUserOperation(params[0], chainHex) ||
        !sameAddress(params[1], ENTRY_POINT_V07) ||
        (params.length === 3 &&
          !validFreshAccountStateOverride(params[2], params[0]))
      ) {
        return { ok: false, error: "Invalid UserOperation request" };
      }
      break;
    case "eth_sendUserOperation":
      if (
        params.length !== 2 ||
        !validUserOperation(params[0], chainHex) ||
        !sameAddress(params[1], ENTRY_POINT_V07)
      ) {
        return { ok: false, error: "Invalid UserOperation request" };
      }
      break;
    case "eth_getUserOperationReceipt":
      if (
        params.length !== 1 ||
        typeof params[0] !== "string" ||
        !/^0x[0-9a-fA-F]{64}$/.test(params[0])
      ) {
        return { ok: false, error: "Invalid UserOperation receipt request" };
      }
      break;
  }

  return { ok: true, envelope: envelope as RpcEnvelope };
}
