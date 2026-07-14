import { Button, Spinner } from "@chakra-ui/react";
import { SimulationFailureConfirmButton } from "@/components/RequestConfirmation/SimulationFailureConfirmButton";

interface ConfirmActionProps {
  customConfirm: boolean;
  confirmDisabled: boolean;
  simulationFailed: boolean;
  submitting: boolean;
  onConfirm: () => void;
}

export function ConfirmAction({
  customConfirm,
  confirmDisabled,
  simulationFailed,
  submitting,
  onConfirm,
}: ConfirmActionProps) {
  return (
    <SimulationFailureConfirmButton
      isDisabled={confirmDisabled}
      isLoading={submitting}
      label={customConfirm ? "Confirm batch" : "Confirm"}
      onConfirm={onConfirm}
      requestKind="batch"
      simulationFailed={simulationFailed}
    />
  );
}

interface RejectActionProps {
  submitting: boolean;
  rejecting: boolean;
  onReject: () => void;
}

export function RejectAction({ submitting, rejecting, onReject }: RejectActionProps) {
  return (
    <Button
      variant="secondary"
      w="full"
      onClick={onReject}
      isLoading={rejecting}
      isDisabled={submitting}
      spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
    >
      Reject
    </Button>
  );
}
