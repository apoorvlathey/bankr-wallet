export const WALLET_HOME_MODE_STORAGE_KEY = "walletHomeModeV1";

export type WalletHomeMode = "public" | "private";

export function resolveWalletHomeMode(value: unknown): WalletHomeMode {
  return value === "private" ? "private" : "public";
}
