import { ArrowUpIcon, CloseIcon } from "@chakra-ui/icons";
import { Button, HStack } from "@chakra-ui/react";

export default function PendingTransactionActions({
  preparing,
  onCancel,
  onSpeedUp,
}: {
  preparing: "cancel" | "speedUp" | null;
  onCancel: () => void;
  onSpeedUp: () => void;
}) {
  return (
    <HStack
      spacing={2}
      w="full"
      justify="center"
      aria-label="Pending transaction actions"
    >
      <Button
        variant="danger"
        size="xs"
        minH="32px"
        px={4}
        leftIcon={<CloseIcon boxSize="10px" aria-hidden />}
        isLoading={preparing === "cancel"}
        isDisabled={preparing !== null}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        variant="brand"
        size="xs"
        minH="32px"
        px={4}
        leftIcon={<ArrowUpIcon boxSize="12px" aria-hidden />}
        isLoading={preparing === "speedUp"}
        isDisabled={preparing !== null}
        onClick={onSpeedUp}
      >
        Speed Up
      </Button>
    </HStack>
  );
}
