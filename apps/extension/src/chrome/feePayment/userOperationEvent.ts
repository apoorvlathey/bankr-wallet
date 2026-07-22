import { decodeEventLog, isAddressEqual } from "viem";
import { ENTRY_POINT_V07 } from "./constants";
import type { Address, Hex } from "./pimlicoTypes";

export const USER_OPERATION_EVENT_ABI = [{
  type: "event",
  name: "UserOperationEvent",
  inputs: [
    { name: "userOpHash", type: "bytes32", indexed: true },
    { name: "sender", type: "address", indexed: true },
    { name: "paymaster", type: "address", indexed: true },
    { name: "nonce", type: "uint256", indexed: false },
    { name: "success", type: "bool", indexed: false },
    { name: "actualGasCost", type: "uint256", indexed: false },
    { name: "actualGasUsed", type: "uint256", indexed: false },
  ],
}] as const;

export const USER_OPERATION_SPONSORED_EVENT_ABI = [{
  type: "event",
  name: "UserOperationSponsored",
  inputs: [
    { name: "userOpHash", type: "bytes32", indexed: true },
    { name: "user", type: "address", indexed: true },
    { name: "paymasterMode", type: "uint8", indexed: false },
    { name: "token", type: "address", indexed: false },
    { name: "tokenAmountPaid", type: "uint256", indexed: false },
    { name: "exchangeRate", type: "uint256", indexed: false },
  ],
}] as const;

const USER_OPERATION_SPONSORED_WITH_FUNDING_EVENT_ABI = [{
  ...USER_OPERATION_SPONSORED_EVENT_ABI[0],
  inputs: [
    ...USER_OPERATION_SPONSORED_EVENT_ABI[0].inputs,
    { name: "fundingAmount", type: "uint256", indexed: false },
  ],
}] as const;

export function getUserOperationPaymasterFromReceipt(
  receipt: Record<string, unknown>,
  userOperationHash: string,
  sender: string,
): Address | null {
  if (!Array.isArray(receipt.logs)) return null;
  for (const rawLog of receipt.logs) {
    const log = rawLog as Record<string, unknown>;
    if (
      typeof log.address !== "string" ||
      !isAddressEqual(log.address as Address, ENTRY_POINT_V07) ||
      !Array.isArray(log.topics) ||
      typeof log.data !== "string"
    ) continue;
    try {
      const decoded = decodeEventLog({
        abi: USER_OPERATION_EVENT_ABI,
        eventName: "UserOperationEvent",
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      if (
        decoded.args.userOpHash.toLowerCase() === userOperationHash.toLowerCase() &&
        isAddressEqual(decoded.args.sender, sender as Address)
      ) return decoded.args.paymaster as Address;
    } catch {
      // Ignore unrelated or malformed EntryPoint logs.
    }
  }
  return null;
}

export function getUserOperationTokenFeeFromReceipt(
  receipt: Record<string, unknown>,
  userOperationHash: string,
  sender: string,
  token: string,
): { paymaster: Address; amountWei: string } | null {
  const paymaster = getUserOperationPaymasterFromReceipt(
    receipt,
    userOperationHash,
    sender,
  );
  if (!paymaster || !Array.isArray(receipt.logs)) return null;
  for (const rawLog of receipt.logs) {
    const log = rawLog as Record<string, unknown>;
    if (
      typeof log.address !== "string" ||
      !isAddressEqual(log.address as Address, paymaster) ||
      !Array.isArray(log.topics) ||
      typeof log.data !== "string"
    ) continue;
    for (const abi of [
      USER_OPERATION_SPONSORED_EVENT_ABI,
      USER_OPERATION_SPONSORED_WITH_FUNDING_EVENT_ABI,
    ] as const) {
      try {
        const decoded = decodeEventLog({
          abi,
          eventName: "UserOperationSponsored",
          data: log.data as Hex,
          topics: log.topics as [Hex, ...Hex[]],
          strict: true,
        });
        if (
          decoded.args.userOpHash.toLowerCase() === userOperationHash.toLowerCase() &&
          isAddressEqual(decoded.args.user, sender as Address) &&
          isAddressEqual(decoded.args.token, token as Address) &&
          decoded.args.tokenAmountPaid > 0n
        ) return { paymaster, amountWei: decoded.args.tokenAmountPaid.toString() };
      } catch {
        // Ignore unrelated or malformed paymaster logs.
      }
    }
  }
  return null;
}
