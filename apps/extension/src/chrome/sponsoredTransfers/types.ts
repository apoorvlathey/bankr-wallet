import type { Account } from "../types";
import type { SponsoredTransferIntentValidation } from "./validation";

export type SponsoredTransferSignerAccount = Exclude<
  Account,
  { type: "impersonator" | "ledger" }
>;

export type ValidSponsoredTransferIntent = Extract<
  SponsoredTransferIntentValidation,
  { valid: true }
>;

export interface SponsoredTransferHandlerResult {
  success: boolean;
  txId?: string;
  intentId?: string;
  error?: string;
  outcomeUncertain?: boolean;
  retryReady?: boolean;
}
