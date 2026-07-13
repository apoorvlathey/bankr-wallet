import { Button, Spinner } from "@chakra-ui/react";
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
  onConfirm: () => void;
}

export function ConfirmActionButton({
  state,
  confirmDisabledReason,
  onConfirm,
}: ConfirmActionButtonProps) {
  return (
    <Button
      variant="brand"
      w="full"
      onClick={onConfirm}
      isDisabled={!!confirmDisabledReason || state === "submitting"}
      isLoading={state === "submitting"}
    >
      Confirm
    </Button>
  );
}
