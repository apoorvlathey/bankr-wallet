import {
  Box,
  Button,
  HStack,
  Icon,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronRightIcon } from "@chakra-ui/icons";
import { CALL_ACCENTS, CALL_ACCENT_FGS } from "@/components/BatchCallsList";

interface SplitBatchModalProps {
  isOpen: boolean;
  callCount: number;
  splitting: boolean;
  signingBlocked: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function SplitBatchModal({
  isOpen,
  callCount,
  splitting,
  signingBlocked,
  onClose,
  onConfirm,
}: SplitBatchModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4}>
        <ModalHeader
          color="fg.primary"
          fontWeight="900"
          fontSize="md"
          borderBottomWidth="1px"
          borderColor="border.subtle"
        >
          Split into individual transactions?
        </ModalHeader>
        <ModalBody py={4}>
          <VStack align="stretch" spacing={4}>
            <HStack justify="center" spacing={3} pt={1}>
              <Box
                px={3}
                py={2}
                borderRadius="md"
                border="1.5px solid"
                borderColor="border.default"
                bg="surface.raised"
              >
                <Text
                  fontSize="2xs"
                  fontWeight="700"
                  color="text.secondary"
                  textTransform="uppercase"
                  textAlign="center"
                >
                  1 Batch
                </Text>
                <Text fontSize="xs" fontWeight="900" color="text.primary" textAlign="center">
                  {callCount} calls
                </Text>
              </Box>
              <Icon as={ChevronRightIcon} boxSize={5} color="text.tertiary" />
              <HStack spacing={1.5}>
                {Array.from({ length: Math.min(callCount, 4) }, (_, index) => (
                  <Box
                    key={index}
                    w={7}
                    h={7}
                    borderRadius="md"
                    bg={CALL_ACCENTS[index % CALL_ACCENTS.length]}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text
                      fontSize="xs"
                      fontWeight="900"
                      color={CALL_ACCENT_FGS[index % CALL_ACCENT_FGS.length]}
                    >
                      {index + 1}
                    </Text>
                  </Box>
                ))}
                {callCount > 4 && (
                  <Text fontSize="xs" fontWeight="700" color="text.tertiary">
                    +{callCount - 4}
                  </Text>
                )}
              </HStack>
            </HStack>
            <Text color="text.secondary" fontSize="sm" fontWeight="500" textAlign="center">
              You'll confirm each call as its own transaction, in order.
            </Text>
          </VStack>
        </ModalBody>
        <ModalFooter gap={2} borderTopWidth="1px" borderColor="border.subtle">
          <Button variant="secondary" size="sm" onClick={onClose} isDisabled={splitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            isLoading={splitting}
            loadingText="Splitting"
            isDisabled={signingBlocked}
          >
            Split
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
