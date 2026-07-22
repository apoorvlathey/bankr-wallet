import type { FeePaymentCall } from "./userOperation";
import type { Address, Hex } from "./pimlicoTypes";

const MAX_SWAP_CALLS = 50;
const MAX_CALLDATA_CHARS = 262_146;

export interface InternalSwapFeePaymentPayload {
  chainId: number;
  calls: FeePaymentCall[];
}

export function parseInternalSwapFeePaymentPayload(
  value: unknown,
): InternalSwapFeePaymentPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid swap fee-payment request");
  }
  const raw = value as { chainId?: unknown; calls?: unknown };
  if (!Number.isSafeInteger(raw.chainId) || Number(raw.chainId) <= 0) {
    throw new Error("Invalid swap fee-payment chain");
  }
  if (!Array.isArray(raw.calls) || raw.calls.length === 0 || raw.calls.length > MAX_SWAP_CALLS) {
    throw new Error("Invalid swap fee-payment calls");
  }
  const calls = raw.calls.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`Invalid swap call ${index + 1}`);
    }
    const call = candidate as { to?: unknown; data?: unknown; value?: unknown };
    if (typeof call.to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(call.to)) {
      throw new Error(`Invalid swap call ${index + 1} destination`);
    }
    const data = call.data ?? "0x";
    if (
      typeof data !== "string" ||
      data.length > MAX_CALLDATA_CHARS ||
      !/^0x(?:[0-9a-fA-F]{2})*$/.test(data)
    ) {
      throw new Error(`Invalid swap call ${index + 1} data`);
    }
    const rawValue = call.value ?? "0x0";
    if (typeof rawValue !== "string" || !/^0x[0-9a-fA-F]+$/.test(rawValue)) {
      throw new Error(`Invalid swap call ${index + 1} value`);
    }
    return {
      to: call.to as Address,
      data: data as Hex,
      value: BigInt(rawValue),
    };
  });
  return { chainId: Number(raw.chainId), calls };
}
