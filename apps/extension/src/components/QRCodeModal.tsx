import { useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  HStack,
  Text,
  IconButton,
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
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="6px 6px 0px 0px #121212"
        borderRadius="none"
        mx={4}
      >
        <ModalHeader
          bg="bauhaus.black"
          color="bauhaus.white"
          fontWeight="900"
          fontSize="md"
          textTransform="uppercase"
          letterSpacing="wider"
          py={2}
          borderBottom="3px solid"
          borderColor="bauhaus.black"
        >
          Receive
        </ModalHeader>
        <ModalCloseButton color="bauhaus.white" top={1} />
        <ModalBody bg="bauhaus.black" py={5} px={4}>
          <VStack spacing={4}>
            {/* QR Code with logo overlay */}
            <Box
              border="3px solid"
              borderColor="bauhaus.black"
              p={3}
              bg="white"
            >
              <QRCodeSVG
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
              fontWeight="700"
              color="whiteAlpha.500"
              wordBreak="break-all"
              textAlign="center"
              lineHeight="tall"
            >
              <Text as="span" color="bauhaus.white">
                {address.slice(0, 6)}
              </Text>
              {address.slice(6, -4)}
              <Text as="span" color="bauhaus.white">
                {address.slice(-4)}
              </Text>
            </Text>

            {/* Copy address button */}
            <HStack
              as="button"
              spacing={1}
              onClick={handleCopy}
              color={copied ? "bauhaus.yellow" : "bauhaus.blue"}
              cursor="pointer"
              _hover={{ opacity: 0.8 }}
            >
              <Text fontSize="sm" fontWeight="700">
                {copied ? "Copied!" : "Copy address"}
              </Text>
              {copied ? (
                <CheckIcon boxSize="12px" />
              ) : (
                <CopyIcon boxSize="12px" />
              )}
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
