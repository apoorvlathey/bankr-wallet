import { hashTypedData } from "viem";
import type {
  EIP712TypedDataTx,
} from "@safe-global/types-kit";
import type {
  SafeAddress,
  SafeSupportedVersion,
  SafeTransactionData,
} from "./types";

const SAFE_TX_FIELDS: EIP712TypedDataTx["types"]["SafeTx"] = [
  { type: "address", name: "to" },
  { type: "uint256", name: "value" },
  { type: "bytes", name: "data" },
  { type: "uint8", name: "operation" },
  { type: "uint256", name: "safeTxGas" },
  { type: "uint256", name: "baseGas" },
  { type: "uint256", name: "gasPrice" },
  { type: "address", name: "gasToken" },
  { type: "address", name: "refundReceiver" },
  { type: "uint256", name: "nonce" },
];

const SAFE_DOMAIN_FIELDS: EIP712TypedDataTx["types"]["EIP712Domain"] = [
  { type: "uint256", name: "chainId" },
  { type: "address", name: "verifyingContract" },
];

export function buildSafeTransactionTypedData(input: {
  chainId: number;
  safeAddress: SafeAddress;
  safeVersion: SafeSupportedVersion;
  transaction: SafeTransactionData;
}): EIP712TypedDataTx {
  if (
    input.safeVersion !== "1.3.0" &&
    input.safeVersion !== "1.4.1" &&
    input.safeVersion !== "1.5.0"
  ) {
    throw new Error("Unsupported Safe transaction version");
  }

  // WalletChan supports only chain-bound Safe versions. Construct the exact
  // canonical SafeTx schema locally instead of importing Protocol Kit's root
  // bundle, whose unrelated deployment and WebAuthn modules would otherwise
  // be loaded into the MV3 service worker.
  return {
    types: {
      EIP712Domain: SAFE_DOMAIN_FIELDS,
      SafeTx: SAFE_TX_FIELDS,
    },
    domain: {
      // Safe Protocol Kit emits a number here even though its public type still
      // declares a string. Preserve the released wire shape for UI signers.
      chainId: input.chainId,
      verifyingContract: input.safeAddress,
    },
    primaryType: "SafeTx",
    message: { ...input.transaction },
  } as unknown as EIP712TypedDataTx;
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
