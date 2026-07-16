import type { Account } from "@/chrome/types";
import { truncateAddress } from "@/lib/addressUtils";

export function getAccountPickerDisplayName(
  account: Account,
  ensName: string | null,
  contactLabel?: string | null,
): string {
  return contactLabel || account.displayName || ensName || truncateAddress(account.address);
}

export function getAccountPickerSecondaryIdentity(
  account: Account,
  ensName: string | null,
  contactLabel?: string | null,
): string {
  if (contactLabel) return truncateAddress(account.address);
  return account.displayName && ensName
    ? `${ensName} · ${truncateAddress(account.address)}`
    : truncateAddress(account.address);
}
