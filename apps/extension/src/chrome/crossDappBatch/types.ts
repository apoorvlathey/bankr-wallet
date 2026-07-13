import type { BundleReceipt } from "../erc5792Types";

export type CrossDappBatchShipResult =
  | {
      kind: "ok";
      txHash: string;
      status: "success" | "pending";
      broadcastUncertain?: boolean;
    }
  | { kind: "reverted"; txHash: string; error: string }
  | { kind: "retryable"; error: string }
  | { kind: "error"; error: string }
  | { kind: "authorization"; error: string };

export type WalletSendCallsFanOutOutcome =
  | { kind: "submitted"; txHash: string }
  | { kind: "confirmed"; txHash: string; receipt?: BundleReceipt | null }
  | { kind: "reverted"; txHash?: string; error: string }
  | { kind: "error"; error: string };

export type EthSendTransactionFanOutOutcome =
  | { kind: "submitted"; txHash: string }
  | { kind: "reverted"; txHash?: string; error: string }
  | { kind: "error"; error: string };
