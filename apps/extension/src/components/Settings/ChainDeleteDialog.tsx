import React from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
} from "@chakra-ui/react";

export default function ChainDeleteDialog({
  chainName,
  isOpen,
  cancelRef,
  onClose,
  onDelete,
}: {
  chainName: string | null;
  isOpen: boolean;
  cancelRef: React.RefObject<HTMLButtonElement>;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose} isCentered>
      <AlertDialogOverlay bg="surface.overlay">
        <AlertDialogContent mx={4} maxW="320px" w="calc(100% - 2rem)">
          <AlertDialogHeader
            fontWeight="900"
            fontSize="md"
            textTransform="uppercase"
            color="fg.primary"
            borderBottomWidth="1px"
            borderColor="border.subtle"
          >
            Delete Chain
          </AlertDialogHeader>
          <AlertDialogBody color="text.secondary" py={4} fontSize="sm" fontWeight="500">
            Remove <strong>{chainName}</strong> from your networks? This cannot be undone.
          </AlertDialogBody>
          <AlertDialogFooter gap={2} borderTopWidth="1px" borderColor="border.subtle">
            <Button ref={cancelRef} variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={onDelete}>Delete</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}
