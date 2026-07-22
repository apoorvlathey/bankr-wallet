import type { AccountSettingsSubView } from "@/components/AccountSettings";
import type { SettingsTab } from "@/components/Settings";

export type AddChainReturnTarget = {
  view: "walletConnect";
  dappName?: string;
};

export type UnlockReturnTarget =
  | { view: "settings"; tab: SettingsTab }
  | { view: "settingsAddChain" }
  | { view: "accountSettings"; subView: AccountSettingsSubView }
  | { view: "privacyAction" };

export const UNLOCK_SUCCESS_HOLD_MS = 500;
export const UNLOCK_SUCCESS_REDUCED_MOTION_HOLD_MS = 120;
