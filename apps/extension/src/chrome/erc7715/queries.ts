/** Account-scoped granted-permission query. */

import { getActiveAccount } from "../accountStorage";
import type { Account } from "../types";
import type { Erc7715PermissionResponse } from "./types";
import { getActiveErc7715PermissionGrantsWithOnchainSync } from "./onchainStatus";

export async function getGrantedExecutionPermissions({
  origin,
  chainId,
  account,
}: {
  origin?: string;
  chainId?: number;
  account?: Account;
} = {}): Promise<Erc7715PermissionResponse[]> {
  const activeAccount = account ?? (await getActiveAccount());
  if (!activeAccount) return [];
  const grants = await getActiveErc7715PermissionGrantsWithOnchainSync({
    origin,
    chainId,
    accountId: activeAccount.id,
  });
  return grants.map((grant) => grant.response);
}
