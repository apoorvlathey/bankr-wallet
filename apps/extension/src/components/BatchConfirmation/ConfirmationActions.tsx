import { Button, Spinner } from "@chakra-ui/react";

interface ConfirmActionProps {
  customConfirm: boolean;
  confirmDisabled: boolean;
  submitting: boolean;
  onConfirm: () => void;
}

export function ConfirmAction({
  customConfirm,
  confirmDisabled,
  submitting,
  onConfirm,
}: ConfirmActionProps) {
  return (
    <Button
      variant="primary"
      w="full"
      onClick={onConfirm}
      isDisabled={confirmDisabled || submitting}
      isLoading={submitting}
    >
      {customConfirm ? "Confirm batch" : "Confirm"}
    </Button>
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
