import { useState, useEffect } from "react";
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
  Input,
  Button,
  FormControl,
  FormLabel,
} from "@chakra-ui/react";
import { getChainConfig } from "@/constants/chainConfig";
import { updateCustomToken, removeCustomToken } from "@/chrome/customTokenStorage";
import ChainIcon from "@/components/ChainIcon";

interface EditCustomTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  token: {
    contractAddress: string;
    chainId: number;
    symbol: string;
    name: string;
    decimals: number;
  } | null;
}

export default function EditCustomTokenModal({
  isOpen,
  onClose,
  onUpdated,
  token,
}: EditCustomTokenModalProps) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  useEffect(() => {
    if (token && isOpen) {
      setName(token.name);
      setSymbol(token.symbol);
      setDecimals(String(token.decimals));
      setConfirmingRemove(false);
    }
  }, [token, isOpen]);

  if (!token) return null;

  const chainConfig = getChainConfig(token.chainId);

  const handleSave = async () => {
    if (!symbol || !decimals) return;
    setSaving(true);
    try {
      await updateCustomToken(token.chainId, token.contractAddress, {
        name,
        symbol,
        decimals: parseInt(decimals, 10),
      });
      onUpdated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveClick = () => {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setSaving(true);
    removeCustomToken(token.chainId, token.contractAddress)
      .then(() => { onUpdated(); onClose(); })
      .finally(() => setSaving(false));
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
          Edit Token
        </ModalHeader>
        <ModalCloseButton color="bauhaus.white" top={1} />
        <ModalBody py={4} px={4}>
          <VStack spacing={4} align="stretch">
            {/* Chain + address display */}
            <HStack spacing={2}>
              <ChainIcon chainId={token.chainId} chainName={chainConfig.name} size="18px" />
              <Text fontWeight="700" fontSize="sm">
                {chainConfig.name}
              </Text>
            </HStack>
            <Text
              fontFamily="mono"
              fontSize="xs"
              color="text.secondary"
              bg="bg.muted"
              px={2}
              py={1.5}
              border="1px solid"
              borderColor="gray.200"
              noOfLines={1}
            >
              {token.contractAddress}
            </Text>

            {/* Editable fields */}
            <FormControl>
              <FormLabel fontSize="xs" fontWeight="700" textTransform="uppercase" color="text.secondary">
                Name
              </FormLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                fontSize="sm"
                border="2px solid"
                borderColor="bauhaus.black"
                borderRadius={0}
                _hover={{ borderColor: "bauhaus.black" }}
                _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
              />
            </FormControl>
            <HStack spacing={3}>
              <FormControl>
                <FormLabel fontSize="xs" fontWeight="700" textTransform="uppercase" color="text.secondary">
                  Symbol
                </FormLabel>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  fontSize="sm"
                  border="2px solid"
                  borderColor="bauhaus.black"
                  borderRadius={0}
                  _hover={{ borderColor: "bauhaus.black" }}
                  _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" fontWeight="700" textTransform="uppercase" color="text.secondary">
                  Decimals
                </FormLabel>
                <Input
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value)}
                  fontSize="sm"
                  type="number"
                  border="2px solid"
                  borderColor="bauhaus.black"
                  borderRadius={0}
                  _hover={{ borderColor: "bauhaus.black" }}
                  _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
                />
              </FormControl>
            </HStack>

            {/* Action buttons */}
            <HStack spacing={3}>
              <Button
                onClick={handleRemoveClick}
                isLoading={saving}
                variant={confirmingRemove ? "solid" : "outline"}
                color={confirmingRemove ? "bauhaus.white" : "bauhaus.red"}
                bg={confirmingRemove ? "bauhaus.red" : "transparent"}
                borderColor="bauhaus.red"
                borderWidth="2px"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="wider"
                fontSize="xs"
                borderRadius={0}
                _hover={{ bg: confirmingRemove ? "red.600" : "red.50" }}
                flex={1}
              >
                {confirmingRemove ? "Confirm?" : "Remove"}
              </Button>
              <Button
                onClick={handleSave}
                isDisabled={!symbol || !decimals || saving}
                isLoading={saving}
                bg="bauhaus.black"
                color="bauhaus.white"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="wider"
                fontSize="xs"
                borderRadius={0}
                border="2px solid"
                borderColor="bauhaus.black"
                _hover={{ bg: "gray.800" }}
                _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
                flex={1}
              >
                Save
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
