export type ShieldDashboardActionId = "shield" | "unshield";

export const SEPOLIA_SHIELD_DASHBOARD = Object.freeze({
  chainId: 11_155_111,
  networkName: "Sepolia",
  modeLabel: "Preview",
  assetSymbol: "ETH",
  balance: "0.0000",
  actions: Object.freeze([
    { id: "shield", label: "Shield" },
    { id: "unshield", label: "Unshield" },
  ] as const),
  activity: Object.freeze([]),
});

export function getShieldActivityCopy(activityCount: number): {
  title: string;
  description: string;
} {
  if (activityCount === 0) {
    return {
      title: "No activity yet",
      description: "Your Shield and Unshield activity will appear here.",
    };
  }

  return {
    title: `${activityCount} ${activityCount === 1 ? "activity" : "activities"}`,
    description: "Your latest private-balance activity.",
  };
}
