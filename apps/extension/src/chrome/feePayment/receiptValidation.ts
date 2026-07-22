import { decodeEventLog, isAddressEqual } from "viem";

import { fetchRawTransactionReceipt } from "../receiptEnrichment";
import { ENTRY_POINT_V07 } from "./constants";
import { USER_OPERATION_EVENT_ABI } from "./userOperationEvent";
export { USER_OPERATION_EVENT_ABI } from "./userOperationEvent";
import type {
  Address,
  Hex,
  UserOperationReceipt,
} from "./pimlicoTypes";

export interface VerifiedUserOperationReceipt {
  txHash: Hex;
  receipt: Record<string, unknown>;
  success: boolean;
  paymaster: Address;
}

export async function verifyUserOperationReceiptOnchain(input: {
  chainId: number;
  sender: Address;
  userOperationHash: Hex;
  bundlerReceipt: UserOperationReceipt;
  fetchReceipt?: typeof fetchRawTransactionReceipt;
}): Promise<VerifiedUserOperationReceipt | null> {
  if (
    input.bundlerReceipt.userOpHash.toLowerCase() !==
      input.userOperationHash.toLowerCase() ||
    !isAddressEqual(input.bundlerReceipt.sender, input.sender)
  ) {
    throw new Error("Pimlico returned a receipt for a different UserOperation");
  }
  const claimedHash = input.bundlerReceipt.receipt.transactionHash;
  if (
    typeof claimedHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(claimedHash)
  ) {
    throw new Error("UserOperation receipt omitted transaction hash");
  }

  const fetched = await (input.fetchReceipt ?? fetchRawTransactionReceipt)(
    claimedHash,
    input.chainId,
  );
  if (!fetched) return null;
  const receipt = fetched.receipt as Record<string, unknown>;
  if (
    typeof receipt.transactionHash !== "string" ||
    receipt.transactionHash.toLowerCase() !== claimedHash.toLowerCase() ||
    !Array.isArray(receipt.logs)
  ) {
    throw new Error("Chain RPC returned an invalid UserOperation receipt");
  }

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
        decoded.args.userOpHash.toLowerCase() ===
          input.userOperationHash.toLowerCase() &&
        isAddressEqual(decoded.args.sender, input.sender)
      ) {
        if (decoded.args.success !== input.bundlerReceipt.success) {
          throw new Error("Pimlico receipt status disagrees with EntryPoint");
        }
        return {
          txHash: claimedHash as Hex,
          receipt,
          success: decoded.args.success,
          paymaster: decoded.args.paymaster as Address,
        };
      }
    } catch (error) {
      if (error instanceof Error && /disagrees with EntryPoint/.test(error.message)) {
        throw error;
      }
    }
  }
  throw new Error("Chain receipt omitted the matching UserOperation event");
}
