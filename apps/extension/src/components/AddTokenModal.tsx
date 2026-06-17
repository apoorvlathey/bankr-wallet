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
  Portal,
} from "@chakra-ui/react";
import { ChevronDownIcon, WarningIcon } from "@chakra-ui/icons";
import {
  getPortfolioTokenKey,
  unhidePortfolioToken,
} from "@/chrome/hiddenPortfolioTokens";
import { useNetworks } from "@/contexts/NetworksContext";
import ChainIcon from "@/components/ChainIcon";
import { getVisibleChains, getResolvedChainByName } from "@/lib/chains";
import { useStripTokens, useTheme } from "@/theme";

interface AddTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenAdded: (options?: { forceSnapshot?: boolean }) => void | Promise<void>;
  existingTokenKeys: Set<string>;
  allTokenKeys: Set<string>;
  hiddenTokenKeys: Set<string>;
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

async function sendCustomTokenWrite(
  message: Record<string, unknown>
): Promise<void> {
  const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
  if (!response?.success) {
    throw new Error(response?.error || "Failed to save token");
  }
}

export default function AddTokenModal({
  isOpen,
  onClose,
  onTokenAdded,
  existingTokenKeys,
  allTokenKeys,
  hiddenTokenKeys,
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

  const tokenKey = getPortfolioTokenKey(selectedChainId, tokenAddress);
  const isHiddenToken = fetched && hiddenTokenKeys.has(tokenKey);
  const isDuplicate =
    fetched && !isHiddenToken && existingTokenKeys.has(tokenKey);

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
    }
  }, [isOpen]);

  // On open, default chain to the wallet's currently selected chain.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    chrome.storage.sync.get("chainName").then(({ chainName }) => {
      if (cancelled) return;
      const activeChain = getResolvedChainByName(chainName, networksInfo);
      const fallback = chainList[0]?.chainId ?? 8453;
      const targetId =
        activeChain && chainList.some((c) => c.chainId === activeChain.chainId)
          ? activeChain.chainId
          : fallback;
      setSelectedChainId(targetId);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, networksInfo, chainList]);

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
      if (isHiddenToken) {
        await unhidePortfolioToken(selectedChainId, tokenAddress);
      }

      if (!isHiddenToken || !allTokenKeys.has(tokenKey)) {
        await sendCustomTokenWrite({
          type: "addCustomToken",
          contractAddress: tokenAddress,
          chainId: selectedChainId,
          symbol,
          name,
          decimals: parseInt(decimals, 10),
        });
      }

      await onTokenAdded({ forceSnapshot: true });
      onClose();
    } catch {
      setError("Failed to save token");
    } finally {
      setSaving(false);
    }
  };

  const selectedChain = chainList.find((c) => c.chainId === selectedChainId);
  const canSave = fetched && !isDuplicate && !loading && !saving && symbol && decimals;
  const saveLabel = isHiddenToken ? "Add Back" : "Add Token";
  const headerStrip = useStripTokens();
  const { tokens } = useTheme();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      size="sm"
      scrollBehavior="inside"
    >
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4} overflow="hidden" maxH="calc(100vh - 2rem)">
        <ModalHeader
          bg={headerStrip.bg}
          color={headerStrip.fg}
          fontWeight="900"
          fontSize="md"
          py={2}
          borderBottomWidth="1px"
          borderColor="border.subtle"
        >
          Add Token
        </ModalHeader>
        <ModalCloseButton color={headerStrip.fg} top={1} />
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
                  border={tokens.borders.thin}
                  borderColor="border.default"
                  borderRadius="md"
                  bg="surface.raised"
                  px={3}
                  py={2}
                  _hover={{ bg: "surface.raisedHover" }}
                  transition="background 0.15s"
                >
                  <HStack spacing={2} justify="space-between">
                    <HStack spacing={2}>
                      <ChainIcon
                        chainId={selectedChainId}
                        chainName={selectedChain?.name}
                        size="18px"
                        withChip
                      />
                      <Text fontWeight="700" fontSize="sm">
                        {selectedChain?.name ?? `Chain ${selectedChainId}`}
                      </Text>
                    </HStack>
                    <ChevronDownIcon />
                  </HStack>
                </MenuButton>
                <Portal>
                  <MenuList maxH="200px" overflowY="auto" p={0} zIndex="popover">
                    {chainList.map((chain) => (
                      <MenuItem
                        key={chain.chainId}
                        onClick={() => handleChainChange(chain.chainId)}
                        bg={chain.chainId === selectedChainId ? "surface.raisedHover" : "transparent"}
                        px={3}
                        py={2}
                      >
                        <HStack spacing={2}>
                          <ChainIcon
                            chainId={chain.chainId}
                            chainName={chain.name}
                            size="18px"
                            withChip
                          />
                          <Text fontWeight="700" fontSize="sm">
                            {chain.name}
                          </Text>
                        </HStack>
                      </MenuItem>
                    ))}
                  </MenuList>
                </Portal>
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
                border={tokens.borders.thin}
                borderColor="status.error.border"
                borderRadius="md"
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
                border={tokens.borders.thin}
                borderColor="status.warning.border"
                borderRadius="md"
                px={3}
                py={2}
              >
                <WarningIcon color="status.warning.fg" boxSize="12px" />
                <Text fontSize="xs" fontWeight="700" color="status.warning.fg">
                  This token is already in your holdings
                </Text>
              </HStack>
            )}

            {/* Hidden token notice */}
            {isHiddenToken && (
              <HStack
                bg="status.info.bg"
                border={tokens.borders.thin}
                borderColor="status.info.border"
                borderRadius="md"
                px={3}
                py={2}
              >
                <WarningIcon color="status.info.fg" boxSize="12px" />
                <Text fontSize="xs" fontWeight="700" color="status.info.fg">
                  This token is hidden. Adding it back will make it visible in
                  all portfolios again.
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
              {saveLabel}
            </Button>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
