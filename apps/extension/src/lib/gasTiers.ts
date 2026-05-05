/**
 * Gas tier preference helpers.
 *
 * The tier picker is a 4-button segmented control: Slow / Standard / Fast /
 * Custom. The user's last preset choice is persisted to chrome.storage.sync
 * so the next confirmation defaults to the same tier. Custom is intentionally
 * NOT persisted — switching to Custom is always a one-shot opt-in for the
 * specific tx the user is currently editing.
 */

import type { TierName } from "@/chrome/feeEstimation";

/** Picker selection — preset tier OR the Custom escape hatch. */
export type GasTierSelection = TierName | "custom";

export const TIER_LABELS: Record<GasTierSelection, string> = {
  slow: "Slow",
  standard: "Standard",
  fast: "Fast",
  custom: "Custom",
};

export const TIER_ORDER: GasTierSelection[] = [
  "slow",
  "standard",
  "fast",
  "custom",
];

export const DEFAULT_TIER: GasTierSelection = "standard";

const STORAGE_KEY = "defaultGasTier";

/** Read the user's last preset choice. Falls back to standard. */
export async function getStoredGasTier(): Promise<GasTierSelection> {
  try {
    const result = (await chrome.storage.sync.get(STORAGE_KEY)) as {
      [STORAGE_KEY]?: unknown;
    };
    const value = result[STORAGE_KEY];
    if (
      value === "slow" ||
      value === "standard" ||
      value === "fast"
    ) {
      return value;
    }
    return DEFAULT_TIER;
  } catch {
    return DEFAULT_TIER;
  }
}

/**
 * Persist the user's tier preference. Custom is treated as a one-shot
 * choice — it does NOT overwrite the stored default. This keeps "I tweaked
 * gas once for that weird dapp" from changing my baseline forever.
 */
export async function setStoredGasTier(tier: GasTierSelection): Promise<void> {
  if (tier === "custom") return;
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: tier });
  } catch {
    // Surfacing a setting-write failure to the user would be more annoying
    // than helpful — the tier still applies for the current confirmation.
  }
}
