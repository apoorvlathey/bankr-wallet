import { getAccounts } from "../accountStorage";
import { deriveAddress } from "../localSigner";
import { getMnemonic } from "./operations";
import { resolveMasterMnemonicAccess } from "./masterAccess";
import {
  derivePrivateKey as deriveSeedPrivateKey,
  isValidMnemonic,
} from "./derivation";

export interface SeedAddressPreviewRequest {
  mnemonic?: string;
  seedGroupId?: string;
  start?: number;
  count?: number;
}

export interface SeedAddressPreviewItem {
  index: number;
  address: string;
  exists: boolean;
}

export type SeedAddressPreviewResult =
  | { success: true; items: SeedAddressPreviewItem[] }
  | { success: false; error: string };

/**
 * Derives public preview addresses without ever returning or persisting the
 * source phrase. A raw phrase is already staged in trusted renderer memory;
 * reading a stored phrase requires a live master mnemonic capability.
 */
export async function previewSeedAddresses(
  request: SeedAddressPreviewRequest,
): Promise<SeedAddressPreviewResult> {
  try {
    let mnemonic: string | null = null;
    if (request.mnemonic) {
      if (!isValidMnemonic(request.mnemonic)) {
        return {
          success: false,
          error: "Invalid seed phrase (must be 12 words)",
        };
      }
      mnemonic = request.mnemonic.trim();
    } else if (request.seedGroupId) {
      const resolved = await resolveMasterMnemonicAccess();
      if (!resolved.success) return resolved;
      mnemonic = await getMnemonic(request.seedGroupId, {
        password: resolved.password,
        mnemonicKey: resolved.mnemonicKey,
        legacyVaultKey: resolved.vaultKey,
      });
      if (!mnemonic) {
        return { success: false, error: "Seed phrase not found" };
      }
    } else {
      return {
        success: false,
        error: "Either mnemonic or seedGroupId is required",
      };
    }

    const start = Math.max(0, Math.floor(request.start ?? 0));
    const count = Math.max(
      1,
      Math.min(20, Math.floor(request.count ?? 5)),
    );
    const existingAddresses = new Set(
      (await getAccounts())
        .filter((account) => account.type !== "impersonator")
        .map((account) => account.address.toLowerCase()),
    );
    const items: SeedAddressPreviewItem[] = [];
    for (let offset = 0; offset < count; offset++) {
      const index = start + offset;
      const privateKey = deriveSeedPrivateKey(mnemonic, index);
      const address = deriveAddress(privateKey);
      items.push({
        index,
        address,
        exists: existingAddresses.has(address.toLowerCase()),
      });
    }
    return { success: true, items };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to preview seed phrase addresses",
    };
  }
}
