import type { AddressContact } from "@/chrome/contactBook/repository";
import type { Account } from "@/chrome/types";

export interface RecipientSuggestion {
  address: string;
  key: string;
  kind: "wallet" | "contact";
  label: string;
  publicName: string | null;
}

export function buildRecipientSuggestions(
  queryValue: string,
  accounts: Account[],
  contacts: AddressContact[],
  getAccountLabel: (account: Account) => string,
  limit = 6,
  getPublicName: (address: string) => string | null = () => null,
): RecipientSuggestion[] {
  const query = queryValue.trim().toLowerCase();
  if (!query) return [];
  const candidates: Array<RecipientSuggestion & { rank: number; order: number }> = [];
  const add = (candidate: RecipientSuggestion, order: number) => {
    const label = candidate.label.toLowerCase();
    const publicName = candidate.publicName?.toLowerCase() || "";
    const address = candidate.address.toLowerCase();
    const rank = label.startsWith(query) || publicName.startsWith(query)
      ? 0
      : label.includes(query) || publicName.includes(query)
        ? 1
        : address.includes(query)
          ? 2
          : -1;
    if (rank >= 0) candidates.push({ ...candidate, rank, order });
  };
  accounts.forEach((account, order) => add({
    address: account.address,
    key: `wallet:${account.id}`,
    kind: "wallet",
    label: getAccountLabel(account),
    publicName: getPublicName(account.address),
  }, order));
  contacts.forEach((contact, order) => add({
    address: contact.address,
    key: `contact:${contact.address.toLowerCase()}`,
    kind: "contact",
    label: contact.label,
    publicName: getPublicName(contact.address),
  }, order));
  return candidates
    .sort((a, b) => a.rank - b.rank || (a.kind === b.kind ? a.order - b.order : a.kind === "wallet" ? -1 : 1))
    .slice(0, limit)
    .map(({ address, key, kind, label, publicName }) => ({ address, key, kind, label, publicName }));
}
