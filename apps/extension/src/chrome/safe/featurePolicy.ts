/**
 * Central fail-closed feature policy for the incremental Safe rollout.
 *
 * A newly added `safe` account must never fall through an EOA or Bankr path.
 * Features move to enabled here only after they are backed by the Safe domain
 * and their PRD gate has passed.
 */
export type SafeFeature =
  | "accountSelection"
  | "portfolio"
  | "receive"
  | "security"
  | "proposalInbox"
  | "sendProposal"
  | "executeProposal"
  | "injectedDapp"
  | "walletConnect"
  | "erc5792"
  | "messageSigning"
  | "swap"
  | "bridge"
  | "shield"
  | "delegatedPermissions"
  | "sponsoredTransfer"
  | "forceInclusion";

export type SafeRolloutPhase =
  | "disabled"
  | "readOnly"
  | "approvals"
  | "execution"
  | "provider";

const PHASE_ORDER: readonly SafeRolloutPhase[] = [
  "disabled",
  "readOnly",
  "approvals",
  "execution",
  "provider",
];

const FEATURE_PHASE: Partial<Record<SafeFeature, SafeRolloutPhase>> = {
  accountSelection: "readOnly",
  portfolio: "readOnly",
  receive: "readOnly",
  security: "readOnly",
  proposalInbox: "readOnly",
  sendProposal: "approvals",
  executeProposal: "execution",
  injectedDapp: "provider",
  walletConnect: "provider",
  erc5792: "provider",
  swap: "approvals",
};

/**
 * Build-time kill switch for staged rollout. A release can stop at any safe
 * boundary without changing call sites. Unsupported v1 features are absent
 * from FEATURE_PHASE and remain denied in every phase.
 */
export function getSafeRolloutPhase(): SafeRolloutPhase {
  const configured = (import.meta as ImportMeta & {
    env?: { VITE_SAFE_ROLLOUT_PHASE?: string };
  }).env?.VITE_SAFE_ROLLOUT_PHASE;
  return PHASE_ORDER.includes(configured as SafeRolloutPhase)
    ? configured as SafeRolloutPhase
    : "provider";
}

export const SAFE_ACCOUNT_UNSUPPORTED_ERROR =
  "This Safe action is not supported yet";

export function isSafeFeatureEnabled(feature: SafeFeature): boolean {
  const required = FEATURE_PHASE[feature];
  return !!required &&
    PHASE_ORDER.indexOf(getSafeRolloutPhase()) >= PHASE_ORDER.indexOf(required);
}

export function requireSafeFeature(feature: SafeFeature): void {
  if (!isSafeFeatureEnabled(feature)) {
    throw new Error(SAFE_ACCOUNT_UNSUPPORTED_ERROR);
  }
}
