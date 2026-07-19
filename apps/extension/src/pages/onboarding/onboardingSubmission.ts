import type { LedgerAccountSelection } from "@/components/Ledger/AddLedgerFlow";
import { validateAndDeriveAddress } from "@/utils/privateKeyUtils";
import { ONBOARDING_OWNER_SESSION_KEY } from "./onboardingEnvironment";
import type { AccountTypeChoice } from "./onboardingTypes";

interface OnboardingSubmissionInput {
  initializationOwnerId: string;
  accountType: AccountTypeChoice;
  password: string;
  apiKey: string;
  walletAddress: string;
  bankrDisplayName: string;
  privateKey: string;
  privateKeyDisplayName: string;
  viewOnlyAddress: string;
  viewOnlyDisplayName: string;
  mnemonic: string;
  seedIndices: number[];
  seedGroupName: string;
  seedAccountDisplayName: string;
  ledgerSelection: LedgerAccountSelection | null;
  resolveAddress(input: string): Promise<string | null>;
}

async function requireSuccess<T extends { success?: boolean; error?: string }>(
  message: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as T;
  if (!response?.success) throw new Error(response?.error || fallback);
  return response;
}

export async function submitOnboardingAccount(
  input: OnboardingSubmissionInput,
): Promise<void> {
  let initializationId: string | null = null;
  try {
    let finalAddress: string;
    let finalDisplayAddress: string;
    let resolvedBankrAddress: string | null = null;
    let resolvedViewOnlyAddress: string | null = null;

    if (input.accountType === "privateKey") {
      const result = validateAndDeriveAddress(input.privateKey);
      if (!result.valid || !result.address || !result.normalizedKey) {
        throw new Error(result.error || "Invalid private key");
      }
    } else if (input.accountType === "seedPhrase") {
      if (!input.mnemonic.trim()) throw new Error("Seed phrase is required");
    } else if (input.accountType === "bankr") {
      resolvedBankrAddress = await input.resolveAddress(
        input.walletAddress.trim(),
      );
      if (!resolvedBankrAddress) throw new Error("Invalid address or name");
    } else if (input.accountType === "viewOnly") {
      resolvedViewOnlyAddress = await input.resolveAddress(
        input.viewOnlyAddress.trim(),
      );
      if (!resolvedViewOnlyAddress) throw new Error("Invalid address or name");
    } else if (!input.ledgerSelection) {
      throw new Error("Connect your Ledger and select at least one account");
    }

    const initialization = await requireSuccess<{
      success: boolean;
      initializationId?: string;
      error?: string;
    }>(
      {
        type: "beginOnboardingInitialization",
        initializationId: input.initializationOwnerId,
      },
      "Failed to start wallet setup safely",
    );
    if (!initialization.initializationId) {
      throw new Error("Failed to start wallet setup safely");
    }
    initializationId = initialization.initializationId;

    const initializeCredential = async (credential: string) => {
      const unlocked = await requireSuccess<{
        success: boolean;
        passwordType?: string;
        error?: string;
      }>(
        {
          type: "initializeOnboardingCredential",
          initializationId,
          credential,
          password: input.password,
        },
        "Failed to verify the wallet password",
      );
      if (unlocked.passwordType !== "master") {
        throw new Error("Failed to verify the wallet password");
      }
    };

    if (input.accountType === "seedPhrase") {
      await initializeCredential("pk-only-mode");
      const response = await requireSuccess<{
        success: boolean;
        error?: string;
        account?: { address?: string; displayName?: string };
      }>(
        {
          type: "addSeedPhraseGroup",
          mnemonic: input.mnemonic,
          indices: input.seedIndices,
          name: input.seedGroupName || undefined,
          accountDisplayName: input.seedAccountDisplayName || undefined,
        },
        "Failed to create seed phrase account",
      );
      if (!response.account?.address) {
        throw new Error("Seed phrase account was not committed safely");
      }
      finalAddress = response.account.address;
      finalDisplayAddress = response.account.displayName || finalAddress;
    } else if (input.accountType === "privateKey") {
      const result = validateAndDeriveAddress(input.privateKey);
      if (!result.valid || !result.address || !result.normalizedKey) {
        throw new Error(result.error || "Invalid private key");
      }
      await initializeCredential("pk-only-mode");
      await requireSuccess(
        {
          type: "addPrivateKeyAccount",
          privateKey: result.normalizedKey,
          displayName: input.privateKeyDisplayName.trim() || undefined,
        },
        "Failed to add private key account",
      );
      finalAddress = result.address;
      finalDisplayAddress = input.privateKeyDisplayName.trim() || result.address;
    } else if (input.accountType === "viewOnly") {
      const resolvedAddress = resolvedViewOnlyAddress!;
      const displayName =
        input.viewOnlyDisplayName.trim() ||
        (input.viewOnlyAddress.trim() !== resolvedAddress
          ? input.viewOnlyAddress.trim()
          : undefined);
      await initializeCredential("pk-only-mode");
      await requireSuccess(
        { type: "addImpersonatorAccount", address: resolvedAddress, displayName },
        "Failed to add view-only account",
      );
      finalAddress = resolvedAddress;
      finalDisplayAddress = displayName || resolvedAddress;
    } else if (input.accountType === "bankr") {
      const resolvedAddress = resolvedBankrAddress!;
      const displayName =
        input.bankrDisplayName.trim() ||
        (input.walletAddress.trim() !== resolvedAddress
          ? input.walletAddress.trim()
          : undefined);
      await initializeCredential(input.apiKey.trim());
      await requireSuccess(
        { type: "addBankrAccount", address: resolvedAddress, displayName },
        "Failed to add Bankr account",
      );
      finalAddress = resolvedAddress;
      finalDisplayAddress = input.bankrDisplayName.trim() || input.walletAddress.trim();
    } else {
      await initializeCredential("pk-only-mode");
      const response = await requireSuccess<{
        success: boolean;
        error?: string;
        account?: { address?: string; displayName?: string };
      }>(
        { type: "addLedgerAccounts", ...input.ledgerSelection! },
        "Failed to add Ledger account",
      );
      if (!response.account?.address) {
        throw new Error("Ledger account was not committed safely");
      }
      finalAddress = response.account.address;
      finalDisplayAddress = response.account.displayName || finalAddress;
    }

    await chrome.storage.sync.set({
      address: finalAddress,
      displayAddress: finalDisplayAddress,
      chainName: "Base",
    });
    await requireSuccess(
      { type: "completeOnboardingInitialization", initializationId },
      "Wallet setup did not complete safely",
    );
    initializationId = null;
    try {
      sessionStorage.removeItem(ONBOARDING_OWNER_SESSION_KEY);
    } catch {
      // Non-secret session metadata is best effort only.
    }

    const { isArcBrowser: storedIsArc } = await chrome.storage.sync.get([
      "isArcBrowser",
    ]);
    if (!storedIsArc) {
      try {
        await chrome.runtime.sendMessage({
          type: "setSidePanelMode",
          enabled: true,
        });
      } catch {
        // Popup mode remains available as a fallback.
      }
    }
    void chrome.runtime.sendMessage({ type: "onboardingComplete" });
  } catch (error) {
    if (initializationId) {
      await chrome.runtime
        .sendMessage({
          type: "rollbackOnboardingInitialization",
          initializationId,
        })
        .catch(() => undefined);
    }
    throw error;
  }
}
