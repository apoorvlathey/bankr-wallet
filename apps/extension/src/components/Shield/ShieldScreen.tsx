import { useEffect, useState } from "react";
import { Button } from "@chakra-ui/react";
import type { Account } from "@/chrome/types";
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

/** Public Sepolia ETH deposit into the wallet-wide private balance. */
export default function ShieldScreen({
  onBack,
  account,
  accounts = [],
}: ShieldScreenProps) {
  const [sourceAccount, setSourceAccount] = useState<ShieldSourceAccount | null>(() => {
    if (account && (account.type === "privateKey" || account.type === "seedPhrase")) {
      return account;
    }
    return accounts.find((candidate) =>
      candidate.type === "privateKey" || candidate.type === "seedPhrase"
    ) ?? null;
  });
  const { initialization, retry } = useShieldInitialization();
  const activity = useShieldOperations();
  const quote = useShieldQuote({ account: sourceAccount, enabled: true });
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
        (candidate.type === "privateKey" || candidate.type === "seedPhrase")
      )) return current;
      return accounts.find((candidate) =>
        candidate.type === "privateKey" || candidate.type === "seedPhrase"
      ) ?? null;
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
