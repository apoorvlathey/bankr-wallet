import type { Account } from "@/chrome/types";

export function getSeedAccountLabel(
  account: Account,
  seedGroupMap: Map<string, string>,
) {
  if (account.type !== "seedPhrase") return null;
  const groupName = seedGroupMap.get(account.seedGroupId) || "Seed phrase";
  return `${groupName} · Account ${account.derivationIndex + 1}`;
}

export function getWalletTypeLabel(
  account: Account,
  seedGroupMap: Map<string, string>,
) {
  if (account.type === "bankr") return "Bankr API";
  if (account.type === "privateKey") return "Private key";
  if (account.type === "seedPhrase") {
    return getSeedAccountLabel(account, seedGroupMap) || "Seed phrase";
  }
  return "View only";
}
