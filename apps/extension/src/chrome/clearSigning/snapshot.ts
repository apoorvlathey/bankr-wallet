import type { ClearSignedMeta } from "../history/types";
import {
  buildApproveMeta,
  buildNativeSendMeta,
  buildTransferMeta,
} from "./assetSnapshotBuilders";
import { buildErc7730Meta } from "./erc7730Snapshot";
import type { ClearSigningTxLike } from "./types";

export interface ClearSignedMetaBuilders {
  approve: typeof buildApproveMeta;
  transfer: typeof buildTransferMeta;
  nativeSend: typeof buildNativeSendMeta;
  erc7730: typeof buildErc7730Meta;
}

const DEFAULT_BUILDERS: ClearSignedMetaBuilders = {
  approve: buildApproveMeta,
  transfer: buildTransferMeta,
  nativeSend: buildNativeSendMeta,
  erc7730: buildErc7730Meta,
};

/** Priority is approve, transfer, plain native send, then ERC-7730. */
export async function buildClearSignedMetaWithBuilders(
  tx: ClearSigningTxLike,
  chainId: number,
  builders: ClearSignedMetaBuilders,
): Promise<ClearSignedMeta | null> {
  const to = tx.to;
  const data = tx.data || "0x";
  const value = tx.value || "0x0";
  if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) return null;

  try {
    const approve = await builders.approve(to, data, chainId);
    if (approve) return approve;

    const transfer = await builders.transfer(to, data, chainId);
    if (transfer) return transfer;

    const isEmptyData = !data || data === "0x" || data === "0x0";
    if (isEmptyData) {
      return await builders.nativeSend(to, value, chainId);
    }
    return await builders.erc7730(to, data, chainId);
  } catch {
    return null;
  }
}

export async function buildClearSignedMeta(
  tx: ClearSigningTxLike,
  chainId: number,
): Promise<ClearSignedMeta | null> {
  return buildClearSignedMetaWithBuilders(tx, chainId, DEFAULT_BUILDERS);
}
