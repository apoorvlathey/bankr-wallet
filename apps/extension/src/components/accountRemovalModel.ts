import type { Account } from "../chrome/types";

export type AccountRemovalStep = "review" | "final";

export interface AccountRemovalCopy {
  title: string;
  description: string;
  warningTitle?: string;
  warningDescription?: string;
  caution: string;
  actionLabel: string;
  loadingLabel: string;
  successTitle: string;
}

export function willDeleteSeedPhrase(
  account: Account,
  accounts: Account[],
): boolean {
  return account.type === "seedPhrase" && !accounts.some(
    (candidate) =>
      candidate.id !== account.id &&
      candidate.type === "seedPhrase" &&
      candidate.seedGroupId === account.seedGroupId,
  );
}

export function getAccountRemovalCopy(
  account: Account,
  accounts: Account[],
  step: AccountRemovalStep,
): AccountRemovalCopy {
  if (willDeleteSeedPhrase(account, accounts)) {
    return step === "review"
      ? {
          title: "Remove account and seed phrase?",
          description: "This is the last account linked to this seed phrase.",
          warningTitle: "Your seed phrase will also be deleted.",
          warningDescription:
            "Back it up before continuing. Without it, you cannot restore this account or derive more accounts from this phrase.",
          caution: "",
          actionLabel: "Continue",
          loadingLabel: "Deleting…",
          successTitle: "Account and seed phrase removed",
        }
      : {
          title: "Delete seed phrase permanently?",
          description:
            "This permanently removes the account and its seed phrase from WalletChan.",
          caution: "WalletChan cannot recover the seed phrase for you.",
          actionLabel: "Delete account and phrase",
          loadingLabel: "Deleting…",
          successTitle: "Account and seed phrase removed",
        };
  }

  const warningTitle =
    account.type === "seedPhrase"
      ? "Make sure you have backed up your seed phrase before removing this account."
      : account.type === "privateKey"
        ? "Make sure you have backed up your private key before removing this account."
        : undefined;

  return {
    title: step === "review" ? "Remove account?" : "Are you absolutely sure?",
    description:
      step === "review"
        ? "Are you sure you want to remove this account?"
        : "This is your final confirmation.",
    warningTitle,
    caution:
      step === "final"
        ? "Cancel now if you do not want to remove this account."
        : "",
    actionLabel: step === "review" ? "Remove account" : "Yes, remove account",
    loadingLabel: "Removing…",
    successTitle: "Account removed",
  };
}
