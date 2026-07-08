import { getAddress, isAddress } from "viem";

export type Erc7715Address = `0x${string}`;

export function isErc7715Address(value: unknown): value is Erc7715Address {
  return typeof value === "string" && isAddress(value, { strict: false });
}

export function normalizeErc7715Address(
  value: unknown,
  label: string,
): Erc7715Address {
  if (!isErc7715Address(value)) {
    throw new Error(`${label} must be an address`);
  }
  return getAddress(value) as Erc7715Address;
}
