import { useEffect, useState } from "react";
import { Button } from "@chakra-ui/react";
import type { Account } from "@/chrome/types";
import { isPrivacyPoolsMutationAccountType } from "@/chrome/privacy/deployment/accountPolicy";
import ShieldAmountPanel from "./ShieldAmountPanel";
import ShieldDashboard from "./ShieldDashboard";
import { useShieldInitialization } from "./hooks/useShieldInitialization";
import { useShieldQuote } from "./hooks/useShieldQuote";
import { useShieldReview } from "./hooks/useShieldReview";
import { useShieldOperation } from "./hooks/useShieldOperation";
import { useShieldOperations } from "./hooks/useShieldOperations";
import type { ShieldSourceAccount } from "./model/shieldQuote";
import ShieldSourceAccountPicker from "./ShieldSourceAccountPicker";

interface ShieldScreenProps {
  onBack: () => void;
  account: ShieldSourceAccount | null;
  accounts?: Account[];
}

function isShieldSourceAccount(account: ShieldSourceAccount): boolean {
  return isPrivacyPoolsMutationAccountType(account.type);
}

/** Public ETH deposit into the active build's wallet-wide private balance. */
export default function ShieldScreen({
  onBack,
  account,
  accounts = [],
}: ShieldScreenProps) {
  const [sourceAccount, setSourceAccount] = useState<ShieldSourceAccount | null>(() => {
    if (account && isShieldSourceAccount(account)) {
      return account;
    }
    return accounts.find(isShieldSourceAccount) ?? null;
  });
  const { initialization, retry } = useShieldInitialization();
  const activity = useShieldOperations();
  const quote = useShieldQuote({
    account: sourceAccount,
    enabled: true,
    priceUsd: activity.series.priceUsd,
  });
  const review = useShieldReview({ account: sourceAccount, quote });
  const operation = useShieldOperation({
    account: sourceAccount,
    quote,
    review,
    onSaved: activity.refresh,
  });
  const operationStatus = operation.state.status;
  const saveOperation = operation.save;

  useEffect(() => {
    setSourceAccount((current) => {
      if (current && accounts.some((candidate) =>
        candidate.id === current.id &&
        isShieldSourceAccount(candidate)
      )) return current;
      return accounts.find(isShieldSourceAccount) ?? null;
    });
  }, [accounts]);

  useEffect(() => {
    if (review.state.status === "ready" && operationStatus === "idle") {
      saveOperation();
    }
  }, [operationStatus, review.state.status, saveOperation]);

  const readyQuote = quote.state.status === "ready" ? quote.state.quote : null;
  const shieldBusy = review.state.status === "preparing" || operation.state.status === "saving";
  const canReviewShield = Boolean(
    initialization.status === "ready" &&
    sourceAccount &&
    readyQuote?.canAfford &&
    review.state.status !== "ready" &&
    operation.state.status !== "saved" &&
    !shieldBusy,
  );

  return (
    <ShieldDashboard
      title="Shield"
      onBack={onBack}
      sourceAccountControl={(
        <ShieldSourceAccountPicker
          accounts={accounts}
          account={sourceAccount}
          onChange={(next) => {
            review.reset();
            operation.reset();
            setSourceAccount(next);
          }}
        />
      )}
      initialization={initialization}
      onRetryInitialization={retry}
      content={(
        <ShieldAmountPanel
          account={sourceAccount}
          quote={quote}
          review={review}
          operation={operation}
        />
      )}
      primaryAction={(
        <Button
          variant="brand"
          onClick={review.prepare}
          isLoading={shieldBusy}
          loadingText="Opening review…"
          isDisabled={!canReviewShield}
        >
          {quote.amount ? "Review shield" : "Enter an amount"}
        </Button>
      )}
    />
  );
}
