import { WarningTwoIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from "@chakra-ui/react";

import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";

export function SafeRemoveDialog({
  address,
  isOpen,
  isRemoving,
  onClose,
  onRemove,
}: {
  address: string;
  isOpen: boolean;
  isRemoving: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={isRemoving ? () => undefined : onClose} isCentered>
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4}>
        <ModalHeader pb={2}>
          <HStack spacing={2}>
            <Box w="32px" h="32px" display="grid" placeItems="center" bg="status.error.bg" borderRadius="md">
              <WarningTwoIcon color="status.error.fg" />
            </Box>
            <Text fontSize="lg">Remove Safe?</Text>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <Text color="fg.secondary" fontSize="sm">
              This removes the Safe from WalletChan. Published proposals and onchain Safe data will not be deleted.
            </Text>
            <Box p={3} bg="surface.sunken" border="1px solid" borderColor="border.default" borderRadius="md">
              <Text mb={1} fontSize="sm" fontWeight="600">Safe address</Text>
              <Box color="fg.secondary" fontFamily="mono" fontSize="xs">
                <MiddleTruncatedAddress address={address} />
              </Box>
            </Box>
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="secondary" onClick={onClose} isDisabled={isRemoving}>Cancel</Button>
          <Button variant="danger" onClick={onRemove} isLoading={isRemoving} loadingText="Removing…">
            Remove Safe
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
