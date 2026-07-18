import type {
  PreviewFidelity,
  PreviewRoute,
  PreviewWalletType,
} from "./types";

export interface PreviewRouteDefinition {
  label: string;
  defaultScenario: string;
  scenarios: readonly string[];
  wallets: readonly PreviewWalletType[];
  fidelity: PreviewFidelity;
}

const ALL_WALLETS: readonly PreviewWalletType[] = [
  "bankr",
  "privateKey",
  "seedPhrase",
];

const SIGNING_WALLETS: readonly PreviewWalletType[] = [
  ...ALL_WALLETS,
  "viewOnly",
];

export const PREVIEW_ROUTE_REGISTRY: Record<
  Exclude<PreviewRoute, "all">,
  PreviewRouteDefinition
> = {
  home: {
    label: "Home",
    defaultScenario: "default",
    scenarios: [
      "default",
      "portfolio-loading",
      "portfolio-empty",
      "portfolio-error",
      "stress",
    ],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  onboarding: {
    label: "Onboarding",
    defaultScenario: "welcome",
    scenarios: ["welcome"],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  unlock: {
    label: "Unlock",
    defaultScenario: "pending-requests",
    scenarios: [
      "pending-requests",
      "empty",
      "invalid-password",
      "submitting",
      "success",
      "biometric-configured",
    ],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  tx: {
    label: "Transaction",
    defaultScenario: "default",
    scenarios: [
      "default",
      "loading",
      "simulation-error",
      "malformed-disabled",
      "stress",
      "impersonator-disabled",
    ],
    wallets: SIGNING_WALLETS,
    fidelity: "production",
  },
  signature: {
    label: "Signature",
    defaultScenario: "personal-sign",
    scenarios: [
      "personal-sign",
      "typed-data-long",
      "siwe-blocked",
      "submitting",
      "impersonator-disabled",
    ],
    wallets: SIGNING_WALLETS,
    fidelity: "production",
  },
  settings: {
    label: "Settings",
    defaultScenario: "root",
    scenarios: [
      "root",
      "no-results",
      "security",
      "data",
      "about",
      "networks",
      "network-add",
      "network-edit",
      "appearance",
      "change-password",
      "auto-lock",
      "agent-password",
      "biometric",
      "clear-signing",
      "transaction-history",
      "ens-browsing",
    ],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  portfolio: {
    label: "Portfolio",
    defaultScenario: "populated",
    scenarios: [
      "populated",
      "loading",
      "empty",
      "error",
      "stress",
      "activity-selected",
    ],
    wallets: ALL_WALLETS,
    fidelity: "composed",
  },
  "tx-detail": {
    label: "Transaction detail",
    defaultScenario: "confirmed",
    scenarios: [
      "confirmed",
      "pending",
      "failed",
      "bridge",
      "bridge-pending",
      "bridge-refunded",
      "swap",
      "swap-pending",
      "approve",
      "approval-revoke",
      "transfer",
      "erc20-transfer",
      "delegation-set",
      "delegation-revoke",
      "erc7715-revoke",
      "atomic-batch",
      "split-batch",
      "force-inclusion",
      "force-inclusion-complete",
      "broadcast-uncertain",
      "deployment",
      "legacy",
      "missing-metadata",
      "stress",
    ],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  swap: {
    label: "Swap / Bridge",
    defaultScenario: "default",
    scenarios: [
      "default",
      "portfolio-loading",
      "portfolio-error",
      "quoted",
      "bridge-quoted",
      "disabled",
    ],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  "swap-picker": {
    label: "Swap picker",
    defaultScenario: "sell",
    scenarios: [
      "sell",
      "buy",
      "chains",
      "search",
      "loading",
      "empty",
      "missing-logo",
      "stress",
    ],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  components: {
    label: "Components",
    defaultScenario: "states",
    scenarios: ["states"],
    wallets: ALL_WALLETS,
    fidelity: "composed",
  },
  "mobile-primitives": {
    label: "Mobile primitives",
    defaultScenario: "journey",
    scenarios: ["journey", "picker", "sheet"],
    wallets: ALL_WALLETS,
    fidelity: "composed",
  },
  "decision-primitives": {
    label: "Decision primitives",
    defaultScenario: "default",
    scenarios: ["default", "stress", "error"],
    wallets: ALL_WALLETS,
    fidelity: "composed",
  },
  batch: {
    label: "Batch",
    defaultScenario: "default",
    scenarios: [
      "default",
      "loading",
      "simulation-error",
      "malformed-disabled",
      "unsafe-self-call",
      "stress",
      "impersonator-disabled",
    ],
    wallets: SIGNING_WALLETS,
    fidelity: "production",
  },
  "cross-batch": {
    label: "Cross-dapp batch",
    defaultScenario: "default",
    scenarios: [
      "default",
      "loading",
      "error",
      "stress",
      "impersonator-disabled",
    ],
    wallets: SIGNING_WALLETS,
    fidelity: "production",
  },
  permission: {
    label: "Permission",
    defaultScenario: "default",
    scenarios: [
      "default",
      "metadata-loading",
      "metadata-unverified",
      "draft-invalid",
      "submitting",
      "advanced-stress",
    ],
    wallets: SIGNING_WALLETS,
    fidelity: "production",
  },
  "watch-asset": {
    label: "Watch asset",
    defaultScenario: "default",
    scenarios: ["default", "long-symbol"],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  "add-chain": {
    label: "Add network",
    defaultScenario: "default",
    scenarios: ["default", "long-name"],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  send: {
    label: "Send",
    defaultScenario: "default",
    scenarios: ["default"],
    wallets: SIGNING_WALLETS,
    fidelity: "production",
  },
  receive: {
    label: "Receive",
    defaultScenario: "qr",
    scenarios: ["qr"],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  more: {
    label: "More",
    defaultScenario: "default",
    scenarios: ["default"],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  "connected-apps": {
    label: "Connected apps",
    defaultScenario: "empty",
    scenarios: ["empty"],
    wallets: ALL_WALLETS,
    fidelity: "production",
  },
  chat: {
    label: "Chat",
    defaultScenario: "history",
    scenarios: ["history", "new"],
    wallets: ["bankr"],
    fidelity: "production",
  },
  "account-management": {
    label: "Account management",
    defaultScenario: "details",
    scenarios: ["details", "security", "add"],
    wallets: SIGNING_WALLETS,
    fidelity: "production",
  },
  "token-management": {
    label: "Token management",
    defaultScenario: "add",
    scenarios: ["add", "edit", "hide", "hidden"],
    wallets: SIGNING_WALLETS,
    fidelity: "production",
  },
};

export const PREVIEW_ROUTES = Object.keys(
  PREVIEW_ROUTE_REGISTRY,
) as Array<Exclude<PreviewRoute, "all">>;

export function isPreviewRoute(value: unknown): value is PreviewRoute {
  return value === "all" ||
    (typeof value === "string" && value in PREVIEW_ROUTE_REGISTRY);
}
