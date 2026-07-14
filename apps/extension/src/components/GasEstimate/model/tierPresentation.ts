import type { GasTierSelection } from "@/lib/gasTiers";

/** Semantic theme colors shared by gas-tier icons and compact tier badges. */
export const GAS_TIER_ACCENT: Record<GasTierSelection, string> = {
  slow: "chart.positive",
  standard: "accent.secondary",
  fast: "chart.numeric",
  custom: "fg.secondary",
};
