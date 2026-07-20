import { generateTypedData } from "@safe-global/protocol-kit";
import { hashTypedData } from "viem";
import type {
  EIP712TypedDataTx,
  SafeTransactionData as ProtocolSafeTransactionData,
} from "@safe-global/types-kit";
import type {
  SafeAddress,
  SafeSupportedVersion,
  SafeTransactionData,
} from "./types";

function toProtocolTransaction(
  transaction: SafeTransactionData,
): ProtocolSafeTransactionData {
  return {
    ...transaction,
    operation: transaction.operation,
  };
}

export function buildSafeTransactionTypedData(input: {
  chainId: number;
  safeAddress: SafeAddress;
  safeVersion: SafeSupportedVersion;
  transaction: SafeTransactionData;
}): EIP712TypedDataTx {
  return generateTypedData({
    safeAddress: input.safeAddress,
    safeVersion: input.safeVersion,
    chainId: BigInt(input.chainId),
    data: toProtocolTransaction(input.transaction),
  }) as EIP712TypedDataTx;
}

export function computeSafeTransactionHash(input: {
  chainId: number;
  safeAddress: SafeAddress;
  safeVersion: SafeSupportedVersion;
  transaction: SafeTransactionData;
}): `0x${string}` {
  const typedData = buildSafeTransactionTypedData(input);
  const types = { SafeTx: typedData.types.SafeTx };
  return hashTypedData({
    domain: {
      ...typedData.domain,
      chainId:
        typedData.domain.chainId === undefined
          ? undefined
          : BigInt(typedData.domain.chainId),
    },
    primaryType: typedData.primaryType,
    types,
    message: typedData.message,
  }) as `0x${string}`;
}
