import { pinnedTxRequest } from "../requests/pinnedRequest";
import type { PinnedTxRequest } from "../requests/pendingTxStorage";
import type { Account } from "../types";
import { DELEGATION_GAS_LIMIT } from "./constants";
import type { Address } from "./types";

export interface DelegationRequestInput {
  id: string;
  chainId: number;
  chainName: string;
  targetDelegate: Address;
  kind: "setDelegate" | "revoke";
  timestamp: number;
}

export function buildDelegationRequest(
  account: Extract<Account, { type: "privateKey" | "seedPhrase" }>,
  input: DelegationRequestInput,
): PinnedTxRequest {
  const fromAddress = account.address as Address;
  return pinnedTxRequest(account, {
    id: input.id,
    tx: {
      from: fromAddress,
      to: fromAddress,
      data: "0x",
      value: "0x0",
      chainId: input.chainId,
      gas: DELEGATION_GAS_LIMIT,
    },
    origin: "WalletChan",
    favicon: null,
    chainName: input.chainName,
    timestamp: input.timestamp,
    trustedInternal: true,
    delegation7702Meta: {
      targetDelegate: input.targetDelegate,
      kind: input.kind,
    },
  });
}
