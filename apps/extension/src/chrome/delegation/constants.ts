import { EIP_7702_DEFAULT_DELEGATE } from "@/constants/chainRegistry";
import type { Address } from "./types";

export const ZERO_DELEGATE_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;
export const DELEGATION_GAS_LIMIT = "0xC350";
export const DEFAULT_DELEGATE_ADDRESS = EIP_7702_DEFAULT_DELEGATE as Address;
