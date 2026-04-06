import { memo, useState, useEffect, useMemo, useRef } from "react";
import { layout, prepare } from "@chenglou/pretext";
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Button,
  HStack,
  VStack,
  Text,
  Box,
  Image,
  IconButton,
  Tooltip,
} from "@chakra-ui/react";
import { ChevronDownIcon, AddIcon, SettingsIcon, CopyIcon, CheckIcon } from "@chakra-ui/icons";
import { blo } from "blo";
import type { Account, SeedGroup } from "@/chrome/types";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";

// Blockies avatar for PK accounts using blo
function BlockieAvatar({
  address,
  size = 20,
}: {
  address: string;
  size?: number;
}) {
  const bloAvatar = blo(address as `0x${string}`);
  return (
    <Image
      src={bloAvatar}
      alt="Account avatar"
      w={`${size}px`}
      h={`${size}px`}
      borderRadius="sm"
      border="2px solid"
      borderColor="bauhaus.black"
    />
  );
}

// Bankr icon for Bankr API accounts
function BankrAvatar({ size = 20 }: { size?: number }) {
  return (
    <Image
      src="/bankr-icon.png"
      alt="Bankr account"
      w={`${size}px`}
      h={`${size}px`}
      borderRadius="sm"
      border="2px solid"
      borderColor="bauhaus.black"
    />
  );
}

// Resolved ENS/Basename avatar (circular, slightly larger to match blockie visual weight)
function EnsAvatar({ src, size = 20 }: { src: string; size?: number }) {
  const adjustedSize = size + 4;
  return (
    <Image
      src={src}
      alt="ENS avatar"
      w={`${adjustedSize}px`}
      h={`${adjustedSize}px`}
      minW={`${adjustedSize}px`}
      borderRadius="full"
      border="2px solid"
      borderColor="bauhaus.black"
      objectFit="cover"
    />
  );
}

// Picks the right avatar based on ENS data, account type, and address
function AccountAvatar({
  account,
  ensAvatar,
  size = 24,
}: {
  account: Account;
  ensAvatar: string | null | undefined;
  size?: number;
}) {
  if (ensAvatar) return <EnsAvatar src={ensAvatar} size={size} />;
  if (account.type === "bankr") return <BankrAvatar size={size} />;
  return <BlockieAvatar address={account.address} size={size} />;
}

interface AccountSwitcherProps {
  accounts: Account[];
  activeAccount: Account | null;
  onAccountSelect: (account: Account) => void;
  onAddAccount: () => void;
  onAccountSettings: (account: Account) => void;
}

function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getSeedLabel(
  account: Account,
  seedGroupMap: Map<string, string>,
): string | null {
  if (account.type !== "seedPhrase") return null;
  const groupName = seedGroupMap.get(account.seedGroupId) || "Seed";
  return `${groupName} · #${account.derivationIndex}`;
}

function AccountSwitcher({
  accounts,
  activeAccount,
  onAccountSelect,
  onAddAccount,
  onAccountSettings,
}: AccountSwitcherProps) {
  const [seedGroupMap, setSeedGroupMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [nameFont, setNameFont] = useState("");

  const accountAddresses = useMemo(
    () => accounts.map((a) => a.address),
    [accounts],
  );
  const { identities } = useEnsIdentities(accountAddresses);

  // Measure container width with ResizeObserver
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => setContainerWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Capture font from the name text element
  const nameFontRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    const node = nameFontRef.current;
    if (!node) return;
    const computed = window.getComputedStyle(node);
    setNameFont(
      [computed.fontStyle, computed.fontVariant, computed.fontWeight, computed.fontSize, computed.fontFamily]
        .filter(Boolean)
        .join(" "),
    );
  }, []);

  useEffect(() => {
    const hasSeedAccounts = accounts.some((a) => a.type === "seedPhrase");
    if (!hasSeedAccounts) return;
    chrome.runtime.sendMessage(
      { type: "getSeedGroups" },
      (groups: SeedGroup[] | null) => {
        if (groups) {
          setSeedGroupMap(new Map(groups.map((g) => [g.id, g.name])));
        }
      },
    );
  }, [accounts]);

  // Get display name with priority: displayName > ENS name > truncated address
  function getAccountDisplayName(account: Account): string {
    if (account.displayName) return account.displayName;
    const ens = identities.get(account.address.toLowerCase());
    if (ens?.name) return ens.name;
    return truncateAddress(account.address);
  }

  // Whether to show secondary truncated address line
  function hasResolvedName(account: Account): boolean {
    if (account.displayName) return true;
    const ens = identities.get(account.address.toLowerCase());
    return !!ens?.name;
  }

  function getEnsName(account: Account): string | null {
    return identities.get(account.address.toLowerCase())?.name ?? null;
  }

  function getEnsAvatar(account: Account): string | null {
    return identities.get(account.address.toLowerCase())?.avatar ?? null;
  }

  // Check if the display name would overflow when rendered next to the avatar
  // Avatar (20px) + gap (6px) + padding-right for chevron (20px) + container padding (12+20=32px)
  const avatarInlineOverhead = 20 + 6 + 20 + 32;
  const displayName = activeAccount ? getAccountDisplayName(activeAccount) : "";
  const nameOverflows = useMemo(() => {
    if (!activeAccount || !hasResolvedName(activeAccount) || !nameFont || containerWidth <= 0) return false;
    const availableForName = containerWidth - avatarInlineOverhead;
    if (availableForName <= 0) return true;
    const prepared = prepare(displayName, nameFont);
    return layout(prepared, availableForName, 16).lineCount > 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, nameFont, containerWidth]);

  return (
    <Menu matchWidth isLazy lazyBehavior="unmount">
      <MenuButton
        as={Button}
        w="full"
        variant="ghost"
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        _hover={{
          transform: "translateY(-2px)",
          boxShadow: "6px 6px 0px 0px #121212",
        }}
        _active={{
          transform: "translate(2px, 2px)",
          boxShadow: "none",
        }}
        textAlign="left"
        fontWeight="700"
        h="auto"
        minH="full"
        py={2}
        px={3}
        pr={5}
        borderRadius="0"
        transition="all 0.2s ease-out"
        overflow="hidden"
        position="relative"
      >
        {/* Hidden probe to measure name font — rendered once, invisible */}
        <Text
          ref={nameFontRef}
          fontSize="sm"
          fontWeight="700"
          position="absolute"
          visibility="hidden"
          pointerEvents="none"
          aria-hidden="true"
        >
          X
        </Text>
        <Box ref={containerRef} minW={0} flex={1}>
        <ChevronDownIcon
          position="absolute"
          bottom="6px"
          right="6px"
          boxSize="14px"
          color="text.secondary"
        />
        {activeAccount ? (
          nameOverflows ? (
          /* Long name layout: name full width on top, avatar + address below */
          <VStack align="start" spacing="3px" minW={0} flex={1}>
            <Text
              fontSize="sm"
              color="text.primary"
              fontWeight="700"
              noOfLines={1}
              maxW="full"
              lineHeight="1.2"
            >
              {getAccountDisplayName(activeAccount)}
            </Text>
            <HStack spacing="6px" minW={0} align="center">
              <Box flexShrink={0}>
                <AccountAvatar
                  account={activeAccount}
                  ensAvatar={getEnsAvatar(activeAccount)}
                  size={18}
                />
              </Box>
              <Text
                fontSize="xs"
                color="text.tertiary"
                fontFamily="mono"
                noOfLines={1}
                lineHeight="1.2"
              >
                {truncateAddress(activeAccount.address)}
              </Text>
            </HStack>
            <HStack spacing={1} flexWrap="wrap" ml="24px">
              {activeAccount.displayName && getEnsName(activeAccount) && (
                <Box bg="gray.600" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="white" fontWeight="800" letterSpacing="wide" noOfLines={1}>
                    {getEnsName(activeAccount)}
                  </Text>
                </Box>
              )}
              {activeAccount.type === "bankr" && (
                <Box bg="bauhaus.blue" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="white" fontWeight="800" textTransform="uppercase" letterSpacing="wide">Bankr</Text>
                </Box>
              )}
              {activeAccount.type === "privateKey" && (
                <Box bg="bauhaus.yellow" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="bauhaus.black" fontWeight="800" textTransform="uppercase" letterSpacing="wide">Private Key</Text>
                </Box>
              )}
              {activeAccount.type === "seedPhrase" && (
                <Box bg="bauhaus.red" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="white" fontWeight="800" textTransform="uppercase" letterSpacing="wide">{getSeedLabel(activeAccount, seedGroupMap) || "Seed"}</Text>
                </Box>
              )}
              {activeAccount.type === "impersonator" && (
                <Box bg="bauhaus.green" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="white" fontWeight="800" textTransform="uppercase" letterSpacing="wide">View Only</Text>
                </Box>
              )}
            </HStack>
          </VStack>
          ) : (
          /* Short/no name layout: avatar on left, name + address + badges stacked right */
          <HStack spacing="6px" minW={0} flex={1} align="start">
            <Box flexShrink={0} mt={hasResolvedName(activeAccount) ? "2px" : 0}>
              <AccountAvatar
                account={activeAccount}
                ensAvatar={getEnsAvatar(activeAccount)}
                size={hasResolvedName(activeAccount) ? 20 : 22}
              />
            </Box>
            <VStack align="start" spacing="2px" minW={0} flex={1}>
              {hasResolvedName(activeAccount) && (
                <Text
                  fontSize="sm"
                  color="text.primary"
                  fontWeight="700"
                  noOfLines={1}
                  maxW="full"
                  lineHeight="1.2"
                >
                  {getAccountDisplayName(activeAccount)}
                </Text>
              )}
              <Text
                fontSize="xs"
                color={hasResolvedName(activeAccount) ? "text.tertiary" : "text.primary"}
                fontFamily="mono"
                fontWeight={hasResolvedName(activeAccount) ? "400" : "700"}
                noOfLines={1}
                lineHeight="1.2"
              >
                {truncateAddress(activeAccount.address)}
              </Text>
              <HStack spacing={1} flexWrap="wrap">
              {activeAccount.displayName && getEnsName(activeAccount) && (
                <Box bg="gray.600" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="white" fontWeight="800" letterSpacing="wide" noOfLines={1}>
                    {getEnsName(activeAccount)}
                  </Text>
                </Box>
              )}
              {activeAccount.type === "bankr" && (
                <Box bg="bauhaus.blue" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="white" fontWeight="800" textTransform="uppercase" letterSpacing="wide">Bankr</Text>
                </Box>
              )}
              {activeAccount.type === "privateKey" && (
                <Box bg="bauhaus.yellow" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="bauhaus.black" fontWeight="800" textTransform="uppercase" letterSpacing="wide">Private Key</Text>
                </Box>
              )}
              {activeAccount.type === "seedPhrase" && (
                <Box bg="bauhaus.red" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="white" fontWeight="800" textTransform="uppercase" letterSpacing="wide">{getSeedLabel(activeAccount, seedGroupMap) || "Seed"}</Text>
                </Box>
              )}
              {activeAccount.type === "impersonator" && (
                <Box bg="bauhaus.green" px={1.5} py={0} borderRadius="sm" border="1px solid" borderColor="bauhaus.black">
                  <Text fontSize="8px" color="white" fontWeight="800" textTransform="uppercase" letterSpacing="wide">View Only</Text>
                </Box>
              )}
            </HStack>
            </VStack>
          </HStack>
          )
        ) : (
          <Text color="text.tertiary">Select Account</Text>
        )}
        </Box>
      </MenuButton>
      <MenuList
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
        borderRadius="0"
        py={0}
        maxH="300px"
        overflowY="auto"
      >
        {accounts.map((account, i) => (
          <MenuItem
            key={account.id}
            bg={account.id === activeAccount?.id ? "bg.muted" : "bauhaus.white"}
            _hover={{ bg: "bg.muted" }}
            borderBottom={i < accounts.length - 1 ? "2px solid" : "none"}
            borderColor="bauhaus.black"
            py={3}
            onClick={() => onAccountSelect(account)}
          >
            <HStack spacing={3} w="full">
              <AccountAvatar
                account={account}
                ensAvatar={getEnsAvatar(account)}
                size={24}
              />
              <VStack align="start" spacing={0} flex={1} minW={0}>
                <HStack spacing={0.5} align="center">
                  <Text
                    fontSize="sm"
                    color="text.primary"
                    fontWeight="700"
                    noOfLines={1}
                  >
                    {getAccountDisplayName(account)}
                  </Text>
                  {!hasResolvedName(account) && (
                    <>
                      <IconButton
                        aria-label="Copy address"
                        icon={copiedId === account.id ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />}
                        size="xs"
                        variant="ghost"
                        minW="16px"
                        h="16px"
                        color={copiedId === account.id ? "bauhaus.green" : "text.tertiary"}
                        _hover={{ color: "bauhaus.blue", bg: "transparent" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(account.address);
                          setCopiedId(account.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                      />
                      {account.id === activeAccount?.id && (
                        <Box w="8px" h="8px" flexShrink={0} bg="bauhaus.green" borderRadius="full" border="2px solid" borderColor="bauhaus.black" />
                      )}
                    </>
                  )}
                </HStack>
                {hasResolvedName(account) && (
                  <HStack spacing={0.5} align="center">
                    <Text fontSize="xs" color="text.tertiary" fontFamily="mono">
                      {truncateAddress(account.address)}
                    </Text>
                    <IconButton
                      aria-label="Copy address"
                      icon={copiedId === account.id ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />}
                      size="xs"
                      variant="ghost"
                      minW="16px"
                      h="16px"
                      color={copiedId === account.id ? "bauhaus.green" : "text.tertiary"}
                      _hover={{ color: "bauhaus.blue", bg: "transparent" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(account.address);
                        setCopiedId(account.id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                    />
                    {account.id === activeAccount?.id && (
                      <Box w="8px" h="8px" flexShrink={0} bg="bauhaus.green" borderRadius="full" border="2px solid" borderColor="bauhaus.black" />
                    )}
                  </HStack>
                )}
                <HStack spacing={1} flexWrap="wrap">
                  {account.displayName && getEnsName(account) && (
                    <Box
                      bg="gray.600"
                      px={1.5}
                      py={0}
                      borderRadius="sm"
                      border="1px solid"
                      borderColor="bauhaus.black"
                      mt={0.5}
                    >
                      <Text
                        fontSize="8px"
                        color="white"
                        fontWeight="800"
                        letterSpacing="wide"
                        noOfLines={1}
                      >
                        {getEnsName(account)}
                      </Text>
                    </Box>
                  )}
                  {account.type === "bankr" && (
                    <Box
                      bg="bauhaus.blue"
                      px={1.5}
                      py={0}
                      borderRadius="sm"
                      border="1px solid"
                      borderColor="bauhaus.black"
                      mt={0.5}
                    >
                      <Text
                        fontSize="8px"
                        color="white"
                        fontWeight="800"
                        textTransform="uppercase"
                        letterSpacing="wide"
                      >
                        Bankr
                      </Text>
                    </Box>
                  )}
                  {account.type === "privateKey" && (
                    <Box
                      bg="bauhaus.yellow"
                      px={1.5}
                      py={0}
                      borderRadius="sm"
                      border="1px solid"
                      borderColor="bauhaus.black"
                      mt={0.5}
                    >
                      <Text
                        fontSize="8px"
                        color="bauhaus.black"
                        fontWeight="800"
                        textTransform="uppercase"
                        letterSpacing="wide"
                      >
                        Private Key
                      </Text>
                    </Box>
                  )}
                  {account.type === "seedPhrase" && (
                    <Box
                      bg="bauhaus.red"
                      px={1.5}
                      py={0}
                      borderRadius="sm"
                      border="1px solid"
                      borderColor="bauhaus.black"
                      mt={0.5}
                    >
                      <Text
                        fontSize="8px"
                        color="white"
                        fontWeight="800"
                        textTransform="uppercase"
                        letterSpacing="wide"
                      >
                        {getSeedLabel(account, seedGroupMap) || "Seed"}
                      </Text>
                    </Box>
                  )}
                  {account.type === "impersonator" && (
                    <Box
                      bg="bauhaus.green"
                      px={1.5}
                      py={0}
                      borderRadius="sm"
                      border="1px solid"
                      borderColor="bauhaus.black"
                      mt={0.5}
                    >
                      <Text
                        fontSize="8px"
                        color="white"
                        fontWeight="800"
                        textTransform="uppercase"
                        letterSpacing="wide"
                      >
                        View Only
                      </Text>
                    </Box>
                  )}
                </HStack>
              </VStack>
              <Tooltip label="Account Settings" hasArrow placement="top">
                <IconButton
                  aria-label="Account Settings"
                  icon={<SettingsIcon boxSize="12px" />}
                  size="xs"
                  variant="ghost"
                  color="text.secondary"
                  _hover={{ color: "bauhaus.blue", bg: "transparent" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAccountSettings(account);
                  }}
                />
              </Tooltip>
            </HStack>
          </MenuItem>
        ))}
        <MenuDivider m={0} borderColor="bauhaus.black" borderWidth="2px" />
        <MenuItem
          bg="bauhaus.white"
          _hover={{ bg: "bg.muted" }}
          py={3}
          onClick={onAddAccount}
        >
          <HStack spacing={3}>
            <Box
              bg="bauhaus.red"
              border="2px solid"
              borderColor="bauhaus.black"
              p={1}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <AddIcon boxSize="14px" color="white" />
            </Box>
            <Text fontSize="sm" color="text.primary" fontWeight="700">
              Add Account
            </Text>
          </HStack>
        </MenuItem>
      </MenuList>
    </Menu>
  );
}

export default memo(AccountSwitcher);
