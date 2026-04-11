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
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4}>
        <ModalHeader
          bg="fg.primary"
          color="fg.inverse"
          fontWeight="900"
          fontSize="md"
          textTransform="uppercase"
          letterSpacing="wider"
          py={2}
          borderBottom="3px solid"
          borderColor="border.default"
        >
          Edit Token
        </ModalHeader>
        <ModalCloseButton color="fg.inverse" top={1} />
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
              borderColor="border.subtle"
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
                />
              </FormControl>
            </HStack>

            {/* Action buttons */}
            <HStack spacing={3}>
              <Button
                onClick={handleRemoveClick}
                isLoading={saving}
                variant="danger"
                fontSize="xs"
                flex={1}
              >
                {confirmingRemove ? "Confirm?" : "Remove"}
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                isDisabled={!symbol || !decimals || saving}
                isLoading={saving}
                fontSize="xs"
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
