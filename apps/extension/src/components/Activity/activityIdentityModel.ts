import type { AddressContact } from "@/chrome/contactBook/repository";
import type { Account } from "@/chrome/types";

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildActivityAddressLabels(
  accounts: readonly Account[],
  contacts: readonly AddressContact[],
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();

  for (const account of accounts) {
    const displayName = nonEmpty(account.displayName);
    const address = account.address.toLowerCase();
    if (displayName && !labels.has(address)) labels.set(address, displayName);
  }

  for (const contact of contacts) {
    const label = nonEmpty(contact.label);
    if (label) labels.set(contact.address.toLowerCase(), label);
  }

  return labels;
}

export function getLiveActivityAddressLabel(
  address: string,
  labels: ReadonlyMap<string, string> | undefined,
): string | null {
  return labels?.get(address.toLowerCase()) ?? null;
}

export function formatActivityAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
