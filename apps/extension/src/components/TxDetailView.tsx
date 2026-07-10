import {
  Button,
  IconButton,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import { AppHeader, AppScreen, ScreenBody } from "@/components/ui";
import type { ReactNode } from "react";

export type TxDetailPresentation = "modal" | "screen";

export interface TxDetailViewProps {
  presentation: TxDetailPresentation;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Presentation-only transaction-detail shell. Data ownership and transaction
 * behavior remain in TxDetailController, so Modal and screen modes render the
 * exact same content tree.
 */
export default function TxDetailView({
  presentation,
  isOpen,
  onClose,
  title,
  children,
}: TxDetailViewProps) {
  if (presentation === "screen") {
    return (
      <AppScreen>
        <AppHeader title={title} onBack={onClose} />
        <ScreenBody py={3}>{children}</ScreenBody>
      </AppScreen>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside" isCentered>
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={3} my={3} maxH="calc(100vh - 24px)">
        <ModalHeader
          color="fg.primary"
          fontSize="lg"
          fontWeight="600"
          py={3}
          borderBottom="1px solid"
          borderColor="border.subtle"
          display="flex"
          alignItems="center"
          justifyContent="space-between"
        >
          {title}
          <IconButton
            aria-label="Close"
            icon={<CloseIcon boxSize="12px" />}
            size="sm"
            variant="ghost"
            minW="36px"
            h="36px"
            onClick={onClose}
            _hover={{ bg: "bg.muted" }}
          />
        </ModalHeader>

        <ModalBody px={4} py={3}>
          {children}
        </ModalBody>

        <ModalFooter borderTopWidth="1px" borderColor="border.subtle" pt={3} pb={4}>
          <Button variant="secondary" size="sm" onClick={onClose} w="full">
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
