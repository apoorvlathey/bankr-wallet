import type { ThemeId } from "@/theme";

export type PreviewRoute =
  | "home"
  | "onboarding"
  | "unlock"
  | "tx"
  | "signature"
  | "settings"
  | "portfolio"
  | "tx-detail"
  | "swap"
  | "swap-picker"
  | "components"
  | "mobile-primitives"
  | "decision-primitives"
  | "batch"
  | "cross-batch"
  | "permission"
  | "watch-asset"
  | "add-chain"
  | "send"
  | "receive"
  | "more"
  | "connected-apps"
  | "chat"
  | "account-management"
  | "token-management"
  | "all";

export type FrameMode =
  | "compact"
  | "popup"
  | "window"
  | "sidepanel"
  | "fullscreen";

export type PreviewWalletType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "viewOnly";

export interface PreviewState {
  route: PreviewRoute;
  theme: ThemeId;
  frame: FrameMode;
  scenario: string;
  wallet: PreviewWalletType;
}

export type PreviewFidelity = "production" | "composed" | "synthetic";
