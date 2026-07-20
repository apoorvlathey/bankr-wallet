import { WarningTwoIcon } from "@chakra-ui/icons";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Text,
  Tooltip,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { useRef, type ReactElement } from "react";

interface SimulationFailureConfirmButtonProps {
  disabledReason?: string | null;
  isDisabled: boolean;
  isLoading: boolean;
  label: string;
  loadingSpinner?: ReactElement;
  loadingText?: string;
  onConfirm: () => void;
  requestKind: "transaction" | "batch";
  simulationFailed: boolean;
}

/**
 * Adds an explicit second decision before a request known to have failed
 * simulation can reach any wallet-specific signing path.
 */
export function SimulationFailureConfirmButton({
  disabledReason,
  isDisabled,
  isLoading,
  label,
  loadingSpinner,
  loadingText,
  onConfirm,
  requestKind,
  simulationFailed,
}: SimulationFailureConfirmButtonProps) {
  const warningDialog = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isBatch = requestKind === "batch";

  const handlePrimaryClick = () => {
    if (simulationFailed) {
      warningDialog.onOpen();
      return;
    }
    onConfirm();
  };

  const handleProceed = () => {
    warningDialog.onClose();
    onConfirm();
  };

  return (
    <>
      <Tooltip
        isDisabled={!disabledReason}
        label={disabledReason ? (
          <VStack align="start" spacing={1} maxW="280px">
            <Text fontSize="xs" fontWeight="700">
              Confirmation blocked
            </Text>
            <Text fontSize="xs" fontWeight="500" lineHeight="short">
              {disabledReason}
            </Text>
          </VStack>
        ) : undefined}
        placement="top"
        openDelay={200}
        hasArrow
      >
        <Box
          w="full"
          role={disabledReason ? "group" : undefined}
          aria-label={disabledReason ? `${label} unavailable. ${disabledReason}` : undefined}
          tabIndex={disabledReason && !isLoading ? 0 : undefined}
          borderRadius="md"
          _focus={{ outline: "none" }}
          _focusVisible={{ boxShadow: "focus" }}
        >
          <Button
            variant="brand"
            w="full"
            leftIcon={simulationFailed ? <WarningTwoIcon boxSize="15px" /> : undefined}
            onClick={handlePrimaryClick}
            isDisabled={isDisabled || isLoading}
            isLoading={isLoading}
            loadingText={loadingText}
            spinner={loadingSpinner}
          >
            {label}
          </Button>
        </Box>
      </Tooltip>

      <AlertDialog
        isOpen={warningDialog.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={warningDialog.onClose}
        isCentered
      >
        <AlertDialogOverlay bg="surface.overlay">
          <AlertDialogContent mx={4} maxW="340px" w="calc(100% - 2rem)">
            <AlertDialogHeader
              display="flex"
              alignItems="center"
              gap={2}
              color="status.error.fg"
              fontSize="md"
              fontWeight="700"
            >
              <WarningTwoIcon boxSize="16px" flexShrink={0} />
              {isBatch ? "Batch likely to fail" : "Transaction likely to fail"}
            </AlertDialogHeader>
            <AlertDialogBody>
              <Text color="fg.secondary" fontSize="sm">
                {isBatch
                  ? "One or more transactions in this batch failed simulation and are likely to fail onchain. Are you sure you want to proceed?"
                  : "This transaction failed simulation and is likely to fail onchain. Are you sure you want to proceed?"}
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button
                ref={cancelRef}
                variant="secondary"
                size="sm"
                onClick={warningDialog.onClose}
              >
                Cancel
              </Button>
              <Button
                variant="brand"
                size="sm"
                leftIcon={<WarningTwoIcon boxSize="13px" />}
                onClick={handleProceed}
              >
                Proceed anyway
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
}
