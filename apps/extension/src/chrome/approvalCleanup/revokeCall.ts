import { getAddress, zeroAddress, type Address } from "viem";

import type { ERC5792Call } from "../erc5792Types";
import { encodeApproveCalldata, parseApproveCalldata } from "@/lib/erc20Approve";

export interface ApprovalRevokeCall {
  tokenAddress: Address;
  spender: Address;
  call: Required<Pick<ERC5792Call, "to" | "data" | "value">>;
}

export function buildApprovalRevokeCall(
  rawTokenAddress: unknown,
  rawSpender: unknown,
): ApprovalRevokeCall {
  if (typeof rawTokenAddress !== "string" || typeof rawSpender !== "string") {
    throw new Error("Invalid approval cleanup addresses");
  }
  const tokenAddress = getAddress(rawTokenAddress) as Address;
  const spender = getAddress(rawSpender) as Address;
  if (tokenAddress === zeroAddress || spender === zeroAddress) {
    throw new Error("Approval cleanup requires non-zero addresses");
  }
  return {
    tokenAddress,
    spender,
    call: {
      to: tokenAddress as `0x${string}`,
      data: encodeApproveCalldata(
        spender as `0x${string}`,
        0n,
      ) as `0x${string}`,
      value: "0x0",
    },
  };
}

export function isSameApprovalRevokeCall(
  call: { to?: string | null; data?: string },
  revoke: ApprovalRevokeCall,
): boolean {
  if (call.to?.toLowerCase() !== revoke.tokenAddress.toLowerCase()) {
    return false;
  }
  const parsed = parseApproveCalldata(call.data ?? "");
  return !!parsed &&
    parsed.isRevoke &&
    parsed.spender.toLowerCase() === revoke.spender.toLowerCase();
}
