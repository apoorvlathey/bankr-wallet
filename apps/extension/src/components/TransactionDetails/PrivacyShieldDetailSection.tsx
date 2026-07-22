import type { PrivacyShieldHistoryMeta } from "@/chrome/txHistoryStorage";
import { isPrivacyShieldPublicRecoveryAvailable } from "@/lib/privacyShieldLifecycle";
import PrivacyShieldLifecycleSummary from "./PrivacyShieldLifecycleSummary";
import PrivacyShieldPendingAction from "./PrivacyShieldPendingAction";

interface PrivacyShieldDetailSectionProps {
  meta: PrivacyShieldHistoryMeta | null;
  networkName: string;
  confirmedAt?: number;
  onUnshield?: () => void;
}

/** Keeps Privacy Pools history status and its recovery action inseparable. */
export default function PrivacyShieldDetailSection({
  meta,
  networkName,
  confirmedAt,
  onUnshield,
}: PrivacyShieldDetailSectionProps) {
  if (!meta) return null;
  return (
    <>
      <PrivacyShieldLifecycleSummary
        meta={meta}
        networkName={networkName}
        confirmedAt={confirmedAt}
      />
      {onUnshield && isPrivacyShieldPublicRecoveryAvailable(meta.state) ? (
        <PrivacyShieldPendingAction onUnshield={onUnshield} />
      ) : null}
    </>
  );
}
