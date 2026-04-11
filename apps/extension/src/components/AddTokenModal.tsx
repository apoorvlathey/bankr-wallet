import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  Box,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  FormControl,
  FormLabel,
  Spinner,
} from "@chakra-ui/react";
import { ChevronDownIcon, WarningIcon } from "@chakra-ui/icons";
import { addCustomToken } from "@/chrome/customTokenStorage";
import { useNetworks } from "@/contexts/NetworksContext";
import ChainIcon from "@/components/ChainIcon";
import { getVisibleChains } from "@/lib/chains";

interface AddTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenAdded: () => void;
  existingTokenKeys: Set<string>;
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export default function AddTokenModal({
  isOpen,
  onClose,
  onTokenAdded,
  existingTokenKeys,
}: AddTokenModalProps) {
  const { networksInfo } = useNetworks();

  // Always derive the selector from the shared chain resolver so custom-chain
  // support lands in one place instead of each modal rebuilding its own list.
  const chainList = useMemo(() => getVisibleChains(networksInfo), [networksInfo]);

  const [selectedChainId, setSelectedChainId] = useState(chainList[0]?.chainId ?? 8453);
  const [tokenAddress, setTokenAddress] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [saving, setSaving] = useState(false);
  const fetchCounterRef = useRef(0);

  const isDuplicate =
    fetched &&
    existingTokenKeys.has(`${selectedChainId}-${tokenAddress.toLowerCase()}`);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTokenAddress("");
      setName("");
      setSymbol("");
      setDecimals("");
      setLoading(false);
      setError(null);
      setFetched(false);
      setSaving(false);
      setSelectedChainId(chainList[0]?.chainId ?? 8453);
    }
  }, [isOpen, chainList]);

  const fetchTokenInfo = useCallback(
    async (address: string, chainId: number) => {
      if (!ADDRESS_REGEX.test(address)) return;

      const counter = ++fetchCounterRef.current;
      setLoading(true);
      setError(null);
      setFetched(false);
      setName("");
      setSymbol("");
      setDecimals("");

      try {
        const result = await new Promise<{
          success: boolean;
          data?: { name: string; symbol: string; decimals: number };
        }>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "fetchTokenInfo", tokenAddress: address, chainId },
            resolve
          );
        });

        // Discard stale response
        if (counter !== fetchCounterRef.current) return;

        if (!result.success || !result.data) {
          setError("Not a valid ERC-20 contract on this chain");
          setLoading(false);
          return;
        }

        setName(result.data.name);
        setSymbol(result.data.symbol);
        setDecimals(String(result.data.decimals));
        setFetched(true);
      } catch {
        if (counter !== fetchCounterRef.current) return;
        setError("Failed to fetch token info");
      } finally {
        if (counter === fetchCounterRef.current) setLoading(false);
      }
    },
    []
  );

  const handleAddressChange = (value: string) => {
    setTokenAddress(value);
    setError(null);
    setFetched(false);
    if (ADDRESS_REGEX.test(value)) {
      fetchTokenInfo(value, selectedChainId);
    }
  };

  const handleChainChange = (chainId: number) => {
    setSelectedChainId(chainId);
    if (ADDRESS_REGEX.test(tokenAddress)) {
      fetchTokenInfo(tokenAddress, chainId);
    }
  };

  const handleSave = async () => {
    if (!fetched || isDuplicate || !symbol || !decimals) return;
    setSaving(true);
    try {
      await addCustomToken({
        contractAddress: tokenAddress,
        chainId: selectedChainId,
        symbol,
        name,
        decimals: parseInt(decimals, 10),
      });
      onTokenAdded();
      onClose();
    } catch {
      setError("Failed to save token");
    } finally {
      setSaving(false);
    }
  };

  const selectedChain = chainList.find((c) => c.chainId === selectedChainId);
  const canSave = fetched && !isDuplicate && !loading && !saving && symbol && decimals;

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
          Add Token
        </ModalHeader>
        <ModalCloseButton color="fg.inverse" top={1} />
        <ModalBody py={4} px={4}>
          <VStack spacing={4} align="stretch">
            {/* Chain selector */}
            <FormControl>
              <FormLabel fontSize="xs" fontWeight="700" textTransform="uppercase" color="text.secondary">
                Chain
              </FormLabel>
              <Menu>
                <MenuButton
                  as={Box}
                  cursor="pointer"
                  border="2px solid"
                  borderColor="border.default"
                  px={3}
                  py={2}
                  _hover={{ bg: "bg.muted" }}
                  transition="background 0.15s"
                >
                  <HStack spacing={2} justify="space-between">
                    <HStack spacing={2}>
                      <ChainIcon
                        chainId={selectedChainId}
                        chainName={selectedChain?.name}
                        size="18px"
                      />
                      <Text fontWeight="700" fontSize="sm">
                        {selectedChain?.name ?? `Chain ${selectedChainId}`}
                      </Text>
                    </HStack>
                    <ChevronDownIcon />
                  </HStack>
                </MenuButton>
                <MenuList
                  bg="surface.raised"
                  border="3px solid"
                  borderColor="border.default"
                  boxShadow="card"
                  maxH="200px"
                  overflowY="auto"
                  p={0}
                  zIndex={10}
                >
                  {chainList.map((chain) => (
                    <MenuItem
                      key={chain.chainId}
                      onClick={() => handleChainChange(chain.chainId)}
                      bg={chain.chainId === selectedChainId ? "bg.muted" : "transparent"}
                      _hover={{ bg: "bg.hover" }}
                      px={3}
                      py={2}
                    >
                      <HStack spacing={2}>
                        <ChainIcon
                          chainId={chain.chainId}
                          chainName={chain.name}
                          size="18px"
                        />
                        <Text fontWeight="700" fontSize="sm">
                          {chain.name}
                        </Text>
                      </HStack>
                    </MenuItem>
                  ))}
                </MenuList>
              </Menu>
            </FormControl>

            {/* Token address input */}
            <FormControl>
              <FormLabel fontSize="xs" fontWeight="700" textTransform="uppercase" color="text.secondary">
                Token Address
              </FormLabel>
              <Input
                placeholder="0x..."
                value={tokenAddress}
                onChange={(e) => handleAddressChange(e.target.value)}
                fontFamily="mono"
                fontSize="sm"
              />
            </FormControl>

            {/* Loading indicator */}
            {loading && (
              <HStack justify="center" py={2}>
                <Spinner size="sm" color="accent.secondary" />
                <Text fontSize="xs" color="text.secondary">
                  Fetching token info...
                </Text>
              </HStack>
            )}

            {/* Error display */}
            {error && (
              <HStack
                bg="status.error.bg"
                border="2px solid"
                borderColor="status.error.border"
                px={3}
                py={2}
              >
                <WarningIcon color="status.error.fg" boxSize="12px" />
                <Text fontSize="xs" fontWeight="700" color="status.error.fg">
                  {error}
                </Text>
              </HStack>
            )}

            {/* Duplicate warning */}
            {isDuplicate && (
              <HStack
                bg="status.warning.bg"
                border="2px solid"
                borderColor="status.warning.border"
                px={3}
                py={2}
              >
                <WarningIcon color="status.warning.fg" boxSize="12px" />
                <Text fontSize="xs" fontWeight="700" color="status.warning.fg">
                  This token is already in your holdings
                </Text>
              </HStack>
            )}

            {/* Fetched metadata fields */}
            {fetched && !isDuplicate && (
              <VStack spacing={3} align="stretch">
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
              </VStack>
            )}

            {/* Save button */}
            <Button
              variant="primary"
              onClick={handleSave}
              isDisabled={!canSave}
              isLoading={saving}
              w="full"
            >
              Add Token
            </Button>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
