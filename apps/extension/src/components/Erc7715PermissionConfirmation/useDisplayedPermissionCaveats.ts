import { useMemo } from "react";

import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "@/chrome/pendingErc7715PermissionStorage";
import { buildErc7715PermissionCaveats } from "@/chrome/erc7715/caveats";

function delegationNonceFromCaveats(
  caveats: PendingErc7715PermissionRequest["caveats"],
): bigint | undefined {
  const nonceCaveat = caveats.find(
    (caveat) => caveat.enforcerName === "NonceEnforcer",
  );
  if (!nonceCaveat || !/^0x[0-9a-f]+$/iu.test(nonceCaveat.terms)) {
    return undefined;
  }
  try {
    return BigInt(nonceCaveat.terms);
  } catch {
    return undefined;
  }
}

export function useDisplayedPermissionCaveats(
  permissionRequest: PendingErc7715PermissionRequest,
  editedRequest: Erc7715PermissionRequest,
) {
  return useMemo(() => {
    try {
      const delegationNonce = delegationNonceFromCaveats(
        permissionRequest.caveats,
      );
      if (delegationNonce === undefined) return permissionRequest.caveats;

      return buildErc7715PermissionCaveats(
        editedRequest as unknown as Record<string, unknown>,
        0,
        { delegationNonce },
      );
    } catch {
      return permissionRequest.caveats;
    }
  }, [editedRequest, permissionRequest.caveats]);
}
