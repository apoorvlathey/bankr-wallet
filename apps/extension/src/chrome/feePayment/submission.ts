import { getUserOperationHash } from "viem/account-abstraction";

import { ENTRY_POINT_V07 } from "./constants";
import {
  PimlicoClient,
  PimlicoRpcError,
} from "./pimlicoClient";
import {
  removePendingUserOperation,
  savePendingUserOperation,
  type PendingUserOperation,
} from "./pendingOperations";
import type { Hex, PackedUserOperationV07 } from "./pimlicoTypes";

export interface RecoverableSubmissionResult {
  userOperationHash: Hex;
  outcomeUnknown: boolean;
  warning?: string;
}

function bigintQuantity(value: Hex, label: string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} is not a valid quantity`);
  }
}

/** Compute the exact EntryPoint v0.7 hash returned by Alto/Pimlico. */
export function getPackedUserOperationHash(
  userOperation: PackedUserOperationV07,
  chainId: number,
): Hex {
  return getUserOperationHash({
    chainId,
    entryPointAddress: ENTRY_POINT_V07,
    entryPointVersion: "0.7",
    userOperation: {
      sender: userOperation.sender,
      nonce: bigintQuantity(userOperation.nonce, "nonce"),
      callData: userOperation.callData,
      callGasLimit: bigintQuantity(userOperation.callGasLimit, "callGasLimit"),
      verificationGasLimit: bigintQuantity(
        userOperation.verificationGasLimit,
        "verificationGasLimit",
      ),
      preVerificationGas: bigintQuantity(
        userOperation.preVerificationGas,
        "preVerificationGas",
      ),
      maxFeePerGas: bigintQuantity(userOperation.maxFeePerGas, "maxFeePerGas"),
      maxPriorityFeePerGas: bigintQuantity(
        userOperation.maxPriorityFeePerGas,
        "maxPriorityFeePerGas",
      ),
      paymaster: userOperation.paymaster,
      paymasterData: userOperation.paymasterData,
      paymasterVerificationGasLimit: userOperation.paymasterVerificationGasLimit
        ? bigintQuantity(
            userOperation.paymasterVerificationGasLimit,
            "paymasterVerificationGasLimit",
          )
        : undefined,
      paymasterPostOpGasLimit: userOperation.paymasterPostOpGasLimit
        ? bigintQuantity(
            userOperation.paymasterPostOpGasLimit,
            "paymasterPostOpGasLimit",
          )
        : undefined,
      signature: userOperation.signature,
    },
  });
}

function isDefiniteRejection(error: unknown): boolean {
  return error instanceof PimlicoRpcError && error.definitive;
}

/**
 * Persist the deterministic hash before broadcast. A definite JSON-RPC/4xx
 * rejection removes it; a lost or 5xx response remains recoverable by hash.
 */
export async function submitUserOperationRecoverably(input: {
  client: PimlicoClient;
  record: Omit<PendingUserOperation, "userOperationHash" | "createdAt">;
  userOperation: PackedUserOperationV07;
  beforeBroadcast?: () => void;
}): Promise<RecoverableSubmissionResult> {
  const userOperationHash = getPackedUserOperationHash(
    input.userOperation,
    input.record.chainId,
  );
  await savePendingUserOperation({
    ...input.record,
    userOperationHash,
    createdAt: Date.now(),
  });

  input.beforeBroadcast?.();
  try {
    const returnedHash = await input.client.sendUserOperation(input.userOperation);
    if (returnedHash.toLowerCase() !== userOperationHash.toLowerCase()) {
      return {
        userOperationHash,
        outcomeUnknown: true,
        warning: "Pimlico returned a different UserOperation hash; tracking the locally derived hash",
      };
    }
    return { userOperationHash, outcomeUnknown: false };
  } catch (error) {
    if (isDefiniteRejection(error)) {
      await removePendingUserOperation(input.record.txId);
      throw error;
    }
    return {
      userOperationHash,
      outcomeUnknown: true,
      warning: "Submission response was lost; tracking the UserOperation in Activity",
    };
  }
}
