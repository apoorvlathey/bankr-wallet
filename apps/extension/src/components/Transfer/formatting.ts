import type { Account } from "@/chrome/types";

export function formatTokenAmount(value: number): string {
  if (value === 0) return "0";
  if (value < 0.000001) return "<0.000001";
  return parseFloat(value.toPrecision(6)).toString();
}

export function getAccountTypeLabel(account: Account): string {
  if (account.type === "bankr") return "Bankr";
  if (account.type === "privateKey") return "Private Key";
  if (account.type === "seedPhrase") return "Seed Phrase";
  if (account.type === "ledger") return "Ledger";
  return "View Only";
}
