import { useMemo, useRef, useState, useEffect } from "react";
import {
  Box,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
} from "@chakra-ui/react";
import { ChevronDownIcon, Search2Icon } from "@chakra-ui/icons";
import {
  CHAIN_REGISTRY,
  SWAP_SUPPORTED_CHAIN_IDS,
} from "@/constants/chainRegistry";
import { getChainConfig } from "@/constants/chainConfig";
import ChainIcon from "@/components/ChainIcon";
import { useChainBadgeStyle } from "@/theme";

interface SwapChainMenuProps {
  selectedChainId: number;
  onSelect: (chainId: number) => void;
}

/**
 * Compact chain picker used on both the YOU SELL and YOU RECEIVE rows
 * of the Swap / Bridge surface. The picker writes only to internal
 * sell/buy chain state in SwapView — never to the global per-tab chain
 * that dapps see. When the two sides resolve to different chains, the
 * surface flips into bridge mode (Bungee quote/build/poll).
 *
 * Today's list = the swap-supported subset of CHAIN_REGISTRY (chains the
 * extension can sign on). Bungee's broader chain list lights up as a
 * destination expansion in a follow-up.
 */
export default function SwapChainMenu({
  selectedChainId,
  onSelect,
}: SwapChainMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [highlighted, setHighlighted] = useState(0);

  const config = getChainConfig(selectedChainId);
  const badgeStyle = useChainBadgeStyle(config.bg, config.text);

  const filtered = useMemo(() => {
    const all = CHAIN_REGISTRY.filter((c) =>
      SWAP_SUPPORTED_CHAIN_IDS.has(c.chainId),
    );
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        String(c.chainId).includes(term),
    );
  }, [search]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    }, 30);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  useEffect(() => setHighlighted(0), [search, isOpen]);

  return (
    <Menu
      isOpen={isOpen}
      initialFocusRef={searchRef}
      onOpen={() => setIsOpen(true)}
      onClose={() => {
        setIsOpen(false);
        setSearch("");
      }}
    >
      <MenuButton
        as={Box}
        cursor="pointer"
        bg={badgeStyle.bg}
        border="2px solid"
        borderColor={badgeStyle.border}
        borderRadius="md"
        px={2}
        py={0.5}
        _hover={{ opacity: 0.8 }}
      >
        <HStack spacing={1.5}>
          <ChainIcon chainId={selectedChainId} chainName={config.name} size="14px" withChip />
          <Text
            fontSize="2xs"
            fontWeight="700"
            color={badgeStyle.fg}
            textTransform="uppercase"
          >
            {config.name}
          </Text>
          <ChevronDownIcon color={badgeStyle.fg} boxSize={3} />
        </HStack>
      </MenuButton>
      <MenuList py={0} minW="160px" zIndex={30}>
        <Box p={2} borderBottom="2px solid" borderColor="border.default">
          <InputGroup size="sm">
            <InputLeftElement pointerEvents="none">
              <Search2Icon color="text.tertiary" boxSize={3} />
            </InputLeftElement>
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chains"
              border="2px solid"
              borderColor="border.default"
              fontWeight="600"
              pl={9}
              _hover={{ borderColor: "border.default" }}
              _focus={{ borderColor: "accent.secondary", boxShadow: "none" }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  e.stopPropagation();
                  setHighlighted((p) =>
                    filtered.length === 0 ? 0 : Math.min(p + 1, filtered.length - 1),
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  e.stopPropagation();
                  setHighlighted((p) => Math.max(p - 1, 0));
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  const pick = filtered[highlighted];
                  if (pick) {
                    onSelect(pick.chainId);
                    setIsOpen(false);
                    setSearch("");
                  }
                  return;
                }
                e.stopPropagation();
              }}
            />
          </InputGroup>
        </Box>
        <Box maxH="220px" overflowY="auto">
          {filtered.map((c, i, arr) => (
            <MenuItem
              key={c.chainId}
              bg={
                i === highlighted || c.chainId === selectedChainId
                  ? "surface.sunken"
                  : "transparent"
              }
              borderBottom={i < arr.length - 1 ? "2px solid" : "none"}
              borderColor="border.default"
              py={2.5}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => {
                onSelect(c.chainId);
                setIsOpen(false);
                setSearch("");
              }}
            >
              <HStack spacing={2}>
                <ChainIcon chainId={c.chainId} chainName={c.name} size="18px" withChip />
                <Text fontWeight="700" fontSize="sm">
                  {c.name}
                </Text>
              </HStack>
            </MenuItem>
          ))}
          {filtered.length === 0 && (
            <Box px={3} py={3}>
              <Text fontSize="sm" fontWeight="700" color="text.secondary">
                No chains match &quot;{search.trim()}&quot;.
              </Text>
            </Box>
          )}
        </Box>
      </MenuList>
    </Menu>
  );
}
