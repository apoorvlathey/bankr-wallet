import { useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  Button,
  Text,
  Box,
} from "@chakra-ui/react";
import { CopyIcon, CheckIcon } from "@chakra-ui/icons";
import { QRCodeSVG } from "qrcode.react";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
}

export function QRCodeModal({ isOpen, onClose, address }: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="sm">
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4}>
        <ModalHeader
          color="fg.primary"
          fontWeight="600"
          fontSize="md"
          py={4}
          borderBottomWidth="1px"
          borderColor="border.subtle"
        >
          Receive
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody py={5} px={4}>
          <VStack spacing={4}>
            {/* QR Code with logo overlay — kept on a literal white tile so the
                code stays scannable regardless of theme. */}
            <Box
              borderWidth="1px"
              borderColor="border.subtle"
              borderRadius="lg"
              p={3.5}
              bg="white"
            >
              <QRCodeSVG
                title="Wallet address QR code"
                value={address}
                size={200}
                level="H"
                imageSettings={{
                  src: "walletchan-icon-white-bg.png",
                  height: 40,
                  width: 40,
                  excavate: true,
                }}
              />
            </Box>

            {/* Full address with highlighted start/end */}
            <Text
              fontFamily="mono"
              fontSize="sm"
              fontWeight="500"
              color="fg.secondary"
              wordBreak="break-all"
              textAlign="center"
              lineHeight="tall"
            >
              <Text as="span" color="fg.primary" fontWeight="600">
                {address.slice(0, 6)}
              </Text>
              {address.slice(6, -4)}
              <Text as="span" color="fg.primary" fontWeight="600">
                {address.slice(-4)}
              </Text>
            </Text>

            {/* Copy address button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              color={copied ? "status.success.fg" : "accent.secondary"}
              leftIcon={copied ? <CheckIcon /> : <CopyIcon />}
            >
              {copied ? "Copied" : "Copy address"}
            </Button>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
