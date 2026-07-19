import { EIP_7702_DEFAULT_DELEGATE } from "@/constants/chainRegistry";

export const ENTRY_POINT_V07 =
  "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;

export const WALLETCHAN_OFFICIAL_DELEGATE = EIP_7702_DEFAULT_DELEGATE;

/** Exact delegation designator used only for fresh-account gas simulation. */
export const WALLETCHAN_OFFICIAL_DELEGATION_CODE =
  `0xef0100${WALLETCHAN_OFFICIAL_DELEGATE.slice(2)}` as const;

export const NATIVE_FEE_TOKEN_ID = "native" as const;
