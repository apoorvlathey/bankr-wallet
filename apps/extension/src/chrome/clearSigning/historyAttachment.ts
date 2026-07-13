import type { ClearSignedMeta } from "../history/types";
import { updateTxInHistory } from "../history/repository";
import { buildClearSignedMeta } from "./snapshot";
import type { ClearSigningTxLike } from "./types";

export interface HistoryAttachmentDependencies {
  build: (
    tx: ClearSigningTxLike,
    chainId: number,
  ) => Promise<ClearSignedMeta | null>;
  update: (
    txId: string,
    updates: { clearSignedMeta: ClearSignedMeta },
  ) => Promise<unknown>;
}

const DEFAULT_DEPENDENCIES: HistoryAttachmentDependencies = {
  build: buildClearSignedMeta,
  update: updateTxInHistory,
};

/** Fire-and-forget history enrichment; snapshot or storage failures stay inert. */
export function attachClearSignedMetaToHistoryWithDependencies(
  txId: string,
  tx: ClearSigningTxLike,
  chainId: number,
  dependencies: HistoryAttachmentDependencies,
): void {
  dependencies
    .build(tx, chainId)
    .then((meta) => {
      if (meta) return dependencies.update(txId, { clearSignedMeta: meta });
    })
    .catch(() => {
      // Best-effort enrichment cannot delay or fail transaction processing.
    });
}

export function attachClearSignedMetaToHistory(
  txId: string,
  tx: ClearSigningTxLike,
  chainId: number,
): void {
  attachClearSignedMetaToHistoryWithDependencies(
    txId,
    tx,
    chainId,
    DEFAULT_DEPENDENCIES,
  );
}
