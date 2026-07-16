import type { Account } from "@/chrome/types";

export type AddressIdentityAvatarKind =
  | "resolved"
  | "walletFallback"
  | "none";

interface AddressIdentityPresentationInput {
  account: Account | null;
  fallbackLabel: string;
  contactLabel?: string | null;
  resolvedAvatar: string | null | undefined;
  resolvedName: string | null | undefined;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getAddressIdentityPresentation({
  account,
  fallbackLabel,
  contactLabel,
  resolvedAvatar,
  resolvedName,
}: AddressIdentityPresentationInput): {
  avatarKind: AddressIdentityAvatarKind;
  label: string;
} {
  const label =
    nonEmpty(contactLabel) ??
    nonEmpty(account?.displayName) ??
    nonEmpty(resolvedName) ??
    fallbackLabel;

  return {
    avatarKind: resolvedAvatar
      ? "resolved"
      : account
        ? "walletFallback"
        : "none",
    label,
  };
}
