declare const __WALLETCHAN_FIREFOX_BUILD__: boolean;

export const WALLET_HOME_MODE_STORAGE_KEY = "walletHomeModeV1";

export type WalletHomeMode = "public" | "private";

export const PRIVATE_HOME_ENABLED =
  typeof __WALLETCHAN_FIREFOX_BUILD__ === "undefined" ||
  !__WALLETCHAN_FIREFOX_BUILD__;

export function resolveWalletHomeMode(
  value: unknown,
  privateHomeEnabled = PRIVATE_HOME_ENABLED,
): WalletHomeMode {
  if (!privateHomeEnabled) return "public";
  return value === "private" ? "private" : "public";
}
