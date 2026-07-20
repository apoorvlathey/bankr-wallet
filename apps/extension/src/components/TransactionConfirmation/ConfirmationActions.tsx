import { Button, Spinner } from "@chakra-ui/react";
import { ShapesLoader } from "@/components/Chat/ShapesLoader";
import { SimulationFailureConfirmButton } from "@/components/RequestConfirmation/SimulationFailureConfirmButton";
import type { ConfirmationState } from "./types";

interface ActionButtonProps {
  state: ConfirmationState;
  isRejecting: boolean;
  onReject: () => void;
}

export function RejectActionButton({
  state,
  isRejecting,
  onReject,
}: ActionButtonProps) {
  return (
    <Button
      variant="secondary"
      w="full"
      onClick={onReject}
      isLoading={isRejecting}
      isDisabled={state === "submitting"}
      spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
    >
      Reject
    </Button>
  );
}

interface ConfirmActionButtonProps {
  state: ConfirmationState;
  confirmDisabledReason: string | null;
  simulationFailed: boolean;
  waitingForLedger?: boolean;
  onConfirm: () => void;
}

export function ConfirmActionButton({
  state,
  confirmDisabledReason,
  simulationFailed,
  waitingForLedger = false,
  onConfirm,
}: ConfirmActionButtonProps) {
  return (
    <SimulationFailureConfirmButton
      isDisabled={!!confirmDisabledReason}
      isLoading={state === "submitting"}
      label="Confirm"
      loadingSpinner={
        waitingForLedger ? (
          <ShapesLoader
            variant="dots"
            size="6px"
            color="accentFg.highlight"
          />
        ) : undefined
      }
      loadingText={waitingForLedger ? "Waiting" : undefined}
      onConfirm={onConfirm}
      requestKind="transaction"
      simulationFailed={simulationFailed}
    />
  );
}
