import type { CompletedTransaction } from "./types";

export type AssetChangeLeg = "source" | "destination";

export interface TxHistoryCursor {
  createdAt: number;
  id: string;
}

export interface TxHistoryPage {
  items: CompletedTransaction[];
  nextCursor: TxHistoryCursor | null;
  hasMore: boolean;
}
