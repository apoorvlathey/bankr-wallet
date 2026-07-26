import HomeQuickActions from "@/components/HomeQuickActions";

export function SafeQuickActions({
  onSend,
  onSwap,
  onMore,
  hasConnectedApps = false,
}: {
  onSend: () => void;
  onSwap: () => void;
  onMore: () => void;
  hasConnectedApps?: boolean;
}) {
  return (
    <HomeQuickActions
      hasConnectedApps={hasConnectedApps}
      onSend={onSend}
      onSwap={onSwap}
      onMore={onMore}
    />
  );
}
