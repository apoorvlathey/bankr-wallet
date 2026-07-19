import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  isAddress,
  isHex,
  pad,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ENTRY_POINT_V07 } from "./constants";
import type { Address, Hex, PackedUserOperationV07 } from "./pimlicoTypes";

export const METAMASK_EOA_STUB_SIGNATURE =
  "0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000011b" as const;

const BATCH_DEFAULT_MODE =
  "0x0100000000000000000000000000000000000000000000000000000000000000" as const;

const DELEGATOR_EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      {
        name: "execution",
        type: "tuple",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "mode", type: "bytes32" },
      { name: "executionCalldata", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export interface FeePaymentCall {
  to: Address;
  value?: bigint;
  data?: Hex;
}

type Execution = { target: Address; value: bigint; callData: Hex };

function normalizeExecution(call: FeePaymentCall, index: number): Execution {
  if (!isAddress(call.to, { strict: true })) {
    throw new Error(`Call ${index + 1} has an invalid recipient`);
  }
  const value = call.value ?? 0n;
  if (value < 0n) throw new Error(`Call ${index + 1} has a negative value`);
  const callData = call.data ?? "0x";
  if (!isHex(callData)) throw new Error(`Call ${index + 1} has invalid calldata`);
  return { target: call.to, value, callData };
}

/** Encode calls exactly as MetaMask Smart Accounts Kit Stateless7702 does. */
export function encodeMetaMaskDeleGatorCalls(
  sender: Address,
  calls: readonly FeePaymentCall[],
): Hex {
  if (!isAddress(sender, { strict: true })) {
    throw new Error("UserOperation sender is invalid");
  }
  if (calls.length === 0) throw new Error("At least one call is required");
  const executions = calls.map(normalizeExecution);

  if (executions.length === 1) {
    const execution = executions[0]!;
    if (execution.target.toLowerCase() === sender.toLowerCase()) {
      if (execution.value !== 0n) {
        throw new Error("A direct smart-account call cannot transfer value");
      }
      return execution.callData;
    }
    return encodeFunctionData({
      abi: DELEGATOR_EXECUTE_ABI,
      functionName: "execute",
      args: [execution],
    });
  }

  const executionCalldata = encodeAbiParameters(
    [
      {
        name: "executions",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    [executions],
  );
  return encodeFunctionData({
    abi: DELEGATOR_EXECUTE_ABI,
    functionName: "execute",
    args: [BATCH_DEFAULT_MODE, executionCalldata],
  });
}

function quantity(value: Hex, label: string): bigint {
  if (!isHex(value)) throw new Error(`${label} is not hex`);
  return BigInt(value);
}

function uint128(value: Hex, label: string): Hex {
  const parsed = quantity(value, label);
  if (parsed < 0n || parsed >= 1n << 128n) {
    throw new Error(`${label} exceeds uint128`);
  }
  return pad(toHex(parsed), { size: 16 });
}

export const SIGNABLE_USER_OPERATION_TYPES = {
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

export function getMetaMaskUserOperationTypedData(
  userOperation: PackedUserOperationV07,
  chainId: number,
) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("UserOperation chain ID must be a positive integer");
  }
  if (!isAddress(userOperation.sender, { strict: true })) {
    throw new Error("UserOperation sender is invalid");
  }
  if (userOperation.factory || userOperation.factoryData) {
    throw new Error("Stateless EIP-7702 accounts cannot use factory data");
  }
  if (!isHex(userOperation.callData)) {
    throw new Error("UserOperation calldata is invalid");
  }

  let paymasterAndData: Hex = "0x";
  if (userOperation.paymaster) {
    if (!isAddress(userOperation.paymaster, { strict: true })) {
      throw new Error("UserOperation paymaster is invalid");
    }
    paymasterAndData = concat([
      userOperation.paymaster,
      uint128(
        userOperation.paymasterVerificationGasLimit ?? "0x0",
        "paymasterVerificationGasLimit",
      ),
      uint128(
        userOperation.paymasterPostOpGasLimit ?? "0x0",
        "paymasterPostOpGasLimit",
      ),
      userOperation.paymasterData ?? "0x",
    ]);
  } else if (
    userOperation.paymasterData ||
    userOperation.paymasterVerificationGasLimit ||
    userOperation.paymasterPostOpGasLimit
  ) {
    throw new Error("Paymaster fields require a paymaster address");
  }

  return {
    domain: {
      chainId,
      name: "EIP7702StatelessDeleGator",
      version: "1",
      verifyingContract: userOperation.sender,
    },
    types: SIGNABLE_USER_OPERATION_TYPES,
    primaryType: "PackedUserOperation" as const,
    message: {
      sender: userOperation.sender,
      nonce: quantity(userOperation.nonce, "nonce"),
      initCode: "0x" as Hex,
      callData: userOperation.callData,
      accountGasLimits: concat([
        uint128(userOperation.verificationGasLimit, "verificationGasLimit"),
        uint128(userOperation.callGasLimit, "callGasLimit"),
      ]),
      preVerificationGas: quantity(
        userOperation.preVerificationGas,
        "preVerificationGas",
      ),
      gasFees: concat([
        uint128(userOperation.maxPriorityFeePerGas, "maxPriorityFeePerGas"),
        uint128(userOperation.maxFeePerGas, "maxFeePerGas"),
      ]),
      paymasterAndData,
      entryPoint: ENTRY_POINT_V07,
    },
  };
}

export async function signMetaMaskUserOperation(
  privateKey: Hex,
  userOperation: PackedUserOperationV07,
  chainId: number,
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== userOperation.sender.toLowerCase()) {
    throw new Error("UserOperation signer does not match sender");
  }
  return account.signTypedData(
    getMetaMaskUserOperationTypedData(userOperation, chainId),
  );
}
