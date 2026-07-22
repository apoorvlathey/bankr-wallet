import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";

interface ClearChatHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ClearChatHistoryDialog({
  isOpen,
  onClose,
  onConfirm,
}: ClearChatHistoryDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4}>
        <ModalHeader
          color="fg.primary"
          fontWeight="600"
          fontSize="md"
          borderBottomWidth="1px"
          borderColor="border.subtle"
        >
          Clear Bankr chat history?
        </ModalHeader>
        <ModalBody py={4}>
          <Text color="text.secondary" fontSize="sm" fontWeight="500">
            This permanently deletes every chat conversation. This action cannot be undone.
          </Text>
        </ModalBody>
        <ModalFooter gap={2} borderTopWidth="1px" borderColor="border.subtle">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Delete
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
