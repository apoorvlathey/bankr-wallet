import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
  Text,
} from "@chakra-ui/react";
import { DeleteIcon } from "@chakra-ui/icons";

import type { SavedRpcEndpoint } from "@/lib/chains";
import { getRpcEndpointName, getRpcUrlLabel } from "./rpcEndpointModel";

type RpcEndpointRemoveDialogProps = {
  endpoint: SavedRpcEndpoint | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function RpcEndpointRemoveDialog({
  endpoint,
  onClose,
  onConfirm,
}: RpcEndpointRemoveDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog
      isOpen={endpoint !== null}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      isCentered
    >
      <AlertDialogOverlay bg="surface.overlay">
        <AlertDialogContent mx={4} maxW="340px" w="calc(100% - 2rem)">
          <AlertDialogHeader color="fg.primary" fontSize="md" fontWeight="700">
            Remove RPC endpoint?
          </AlertDialogHeader>
          <AlertDialogBody color="fg.secondary" fontSize="sm">
            <Text>
              Remove {endpoint ? getRpcEndpointName(endpoint) : "this endpoint"}{" "}
              from the saved list?
            </Text>
            {endpoint && (
              <Text
                mt={2}
                color="fg.muted"
                fontFamily="mono"
                fontSize="xs"
                overflowWrap="anywhere"
              >
                {getRpcUrlLabel(endpoint.url)}
              </Text>
            )}
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button ref={cancelRef} variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<DeleteIcon />}
              onClick={onConfirm}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}
