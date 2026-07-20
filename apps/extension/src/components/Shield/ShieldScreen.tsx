import { useState } from "react";
import ShieldAmountPanel from "./ShieldAmountPanel";
import ShieldDashboard from "./ShieldDashboard";
import UnshieldAmountPanel from "./UnshieldAmountPanel";
import { type ShieldDashboardActionId } from "./model/shieldDashboard";
import { useShieldInitialization } from "./hooks/useShieldInitialization";
import { useShieldQuote } from "./hooks/useShieldQuote";
import { useShieldReview } from "./hooks/useShieldReview";
import { useShieldOperation } from "./hooks/useShieldOperation";
import { useShieldOperations } from "./hooks/useShieldOperations";
import type { ShieldSourceAccount } from "./model/shieldQuote";
import { useUnshield } from "./hooks/useUnshield";
import { usePublicRecovery } from "./hooks/usePublicRecovery";
import PublicRecoveryPanel from "./PublicRecoveryPanel";
import { useShieldNativePrice } from "./hooks/useShieldNativePrice";
import { getPublicWithdrawalOffer } from "./model/recovery";

interface ShieldScreenProps {
  onBack: () => void;
  account: ShieldSourceAccount | null;
}

/** Balance-first screen with silent background privacy identity setup. */
export default function ShieldScreen({ onBack, account }: ShieldScreenProps) {
  const [shieldPanelOpen, setShieldPanelOpen] = useState(false);
  const [unshieldPanelOpen, setUnshieldPanelOpen] = useState(false);
  const { initialization, retry } = useShieldInitialization();
  const quote = useShieldQuote({
    account,
    enabled: shieldPanelOpen,
  });
  const review = useShieldReview({ account, quote });
  const activity = useShieldOperations();
  const nativePriceUsd = useShieldNativePrice();
  const operation = useShieldOperation({
    account,
    quote,
    review,
    onSaved: activity.refresh,
  });
  const unshield = useUnshield({
    availableWei: activity.portfolio.readyBalanceWei,
    onComplete: activity.refresh,
  });
  const publicRecovery = usePublicRecovery(activity.refresh);
  const publicWithdrawalOffer = getPublicWithdrawalOffer({
    account,
    recoverableBalanceWei: activity.portfolio.recoverableBalanceWei,
    operations: activity.operations,
  });

  return (
    <ShieldDashboard
      onBack={onBack}
      initialization={initialization}
      operations={activity.operations}
      withdrawals={activity.withdrawals}
      recoveries={activity.recoveries}
      confirmedBalanceWei={activity.portfolio.confirmedBalanceWei}
      pendingAspBalanceWei={activity.portfolio.pendingBalanceWei}
      nativePriceUsd={nativePriceUsd}
      onRetryInitialization={retry}
      shieldPanel={
        shieldPanelOpen ? (
          <ShieldAmountPanel
            account={account}
            quote={quote}
            review={review}
            operation={operation}
          />
        ) : null
      }
      unshieldPanel={
        unshieldPanelOpen ? (
          <UnshieldAmountPanel
            availableWei={activity.portfolio.readyBalanceWei}
            controller={unshield}
          />
        ) : null
      }
      recoveryPanel={
        <PublicRecoveryPanel
          amountWei={publicWithdrawalOffer?.amountWei ?? 0n}
          depositAccountAddress={publicWithdrawalOffer?.accountAddress ?? ""}
          activeAccountMatches={publicWithdrawalOffer?.activeAccountMatches ?? false}
          waitingForAsp={
            activity.portfolio.pendingBalanceWei > 0n &&
            activity.portfolio.attentionCount === 0
          }
          status={publicRecovery.status}
          error={publicRecovery.error}
          onRecover={publicRecovery.prepare}
        />
      }
      onAction={(action: ShieldDashboardActionId) => {
        if (action === "shield") {
          setShieldPanelOpen(true);
          setUnshieldPanelOpen(false);
          return;
        }
        setShieldPanelOpen(false);
        setUnshieldPanelOpen(true);
      }}
    />
  );
}
