import { AddIcon, CheckIcon, CopyIcon, EditIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Button,
  HStack,
  Icon,
  IconButton,
  Image,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { isDarkThemeId, useTheme } from "@/theme";
import { getAddressIdentityPresentation } from "./addressIdentityPresentation";
import { useAddressContact } from "@/hooks/useAddressContacts";
import { AddressContactEditorModal } from "@/components/shared/AddressContactEditorModal";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/u;

interface AddressActionsProps {
  address: string;
  compact?: boolean;
  contextLabel?: string;
  explorer?: string;
  showAddress?: boolean;
  suggestedLabel?: string;
}

export function AddressActions({
  address,
  compact = false,
  contextLabel = "address",
  explorer,
  showAddress = true,
  suggestedLabel,
}: AddressActionsProps) {
  const [copied, setCopied] = useState(false);
  const [isContactEditorOpen, setIsContactEditorOpen] = useState(false);
  const { contact } = useAddressContact(address);
  const copiedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortAddress = compact
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : `${address.slice(0, 8)}...${address.slice(-6)}`;
  const explorerUrl = useMemo(
    () =>
      explorer
        ? `${explorer.replace(/\/+$/u, "")}/address/${address}`
        : null,
    [address, explorer],
  );

  useEffect(
    () => () => {
      if (copiedResetTimer.current) clearTimeout(copiedResetTimer.current);
    },
    [],
  );

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (copiedResetTimer.current) clearTimeout(copiedResetTimer.current);
      copiedResetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be unavailable in restricted extension contexts.
    }
  };

  return (
    <>
      <VStack spacing={1} align="stretch">
        <HStack spacing={0.5} minW={0} justify="flex-end" whiteSpace="nowrap">
          {showAddress && (
            <Text
              minW={0}
              px={1}
              color="fg.primary"
              fontFamily="mono"
              fontSize="xs"
              fontWeight="600"
              noOfLines={1}
              title={address}
              aria-label={address}
            >
              {shortAddress}
            </Text>
          )}
          <IconButton
            aria-label={`Copy ${contextLabel}`}
            icon={copied ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="11px" />}
            size="xs"
            variant="ghost"
            minW="24px"
            w="24px"
            h="24px"
            color={copied ? "accent.highlight" : "fg.muted"}
            onClick={copyAddress}
          />
          {explorerUrl && (
            <IconButton
              as="a"
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${contextLabel} on explorer`}
              icon={<ExternalLinkIcon boxSize="11px" />}
              size="xs"
              variant="ghost"
              minW="24px"
              w="24px"
              h="24px"
              color="fg.muted"
            />
          )}
        </HStack>
        <Button
          size="xs"
          variant="ghost"
          leftIcon={contact ? <EditIcon boxSize="12px" aria-hidden /> : <AddIcon boxSize="12px" aria-hidden />}
          justifyContent="flex-start"
          minH="32px"
          onClick={() => setIsContactEditorOpen(true)}
        >
          {contact ? "Edit contact" : "Add to contacts"}
        </Button>
      </VStack>
      <AddressContactEditorModal
        address={address}
        initialLabel={contact?.label ?? suggestedLabel}
        isEditing={Boolean(contact)}
        isOpen={isContactEditorOpen}
        onClose={() => setIsContactEditorOpen(false)}
      />
    </>
  );
}

const MoreHorizontalIcon = () => (
  <Icon viewBox="0 0 20 20" boxSize="16px" aria-hidden="true">
    <circle cx="4" cy="10" r="1.5" fill="currentColor" />
    <circle cx="10" cy="10" r="1.5" fill="currentColor" />
    <circle cx="16" cy="10" r="1.5" fill="currentColor" />
  </Icon>
);

function isRawAddressLabel(label: string, address: string): boolean {
  const normalized = label.trim();
  return (
    normalized.toLowerCase() === address.toLowerCase() ||
    /^0x[a-fA-F0-9]{4,12}(?:\.\.\.|…)[a-fA-F0-9]{4,12}$/u.test(normalized)
  );
}

interface LabeledAddressPopoverProps {
  address: string;
  contextLabel?: string;
  explorer?: string;
  label: string;
  maxW?: string;
}

export function LabeledAddressPopover({
  address,
  contextLabel = "address",
  explorer,
  label,
  maxW = "220px",
}: LabeledAddressPopoverProps) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const isAddress = ADDRESS_REGEX.test(address);
  const identityAddresses = useMemo(
    () => (isAddress ? [address] : []),
    [address, isAddress],
  );
  const { identities } = useEnsIdentities(identityAddresses);
  const identity = identities.get(address.toLowerCase());
  const cachedIdentityAvatar = useCachedAvatarSrc(identity?.avatar);
  const [account, setAccount] = useState<Account | null>(null);
  const { contact } = useAddressContact(address);

  useEffect(() => {
    setAccount(null);
    if (!isAddress) return;

    let cancelled = false;
    chrome.runtime.sendMessage(
      { type: "getAccounts" },
      (accounts: Account[] | null) => {
        if (cancelled || chrome.runtime.lastError || !Array.isArray(accounts)) {
          return;
        }
        const matchingAccount = accounts.find(
          (candidate) =>
            candidate.address.toLowerCase() === address.toLowerCase(),
        );
        setAccount(matchingAccount ?? null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [address, isAddress]);

  const presentation = getAddressIdentityPresentation({
    account,
    contactLabel: contact?.label,
    fallbackLabel: label,
    resolvedAvatar: identity?.avatar,
    resolvedName: identity?.name,
  });
  const suggestedLabel = contact?.label
    ?? account?.displayName
    ?? identity?.name
    ?? (isRawAddressLabel(label, address) ? undefined : label.trim() || undefined);

  const avatar =
    presentation.avatarKind === "resolved" && identity?.avatar ? (
      <Image
        src={cachedIdentityAvatar || identity.avatar}
        alt="Resolved address avatar"
        boxSize="20px"
        minW="20px"
        borderRadius="full"
        objectFit="cover"
      />
    ) : presentation.avatarKind === "walletFallback" && account ? (
      <AccountAvatar account={account} ensAvatar={null} size={20} />
    ) : null;

  return (
    <HStack
      spacing={1}
      minW={0}
      maxW={maxW}
      pl={avatar ? 1 : 2}
      bg={isDarkTheme ? "surface.raisedHover" : "accent.secondary"}
      color={isDarkTheme ? "fg.primary" : "accentFg.secondary"}
      border="1px solid"
      borderColor={isDarkTheme ? "border.default" : "accent.secondary"}
      borderRadius="md"
    >
      {avatar}
      <Text
        minW={0}
        fontSize="2xs"
        fontWeight="700"
        noOfLines={1}
        title={presentation.label}
      >
        {presentation.label}
      </Text>

      <Popover
        trigger="hover"
        placement="bottom-end"
        openDelay={120}
        closeDelay={220}
        gutter={6}
        isLazy
        lazyBehavior="keepMounted"
      >
        <PopoverTrigger>
          <IconButton
            aria-label={`Show ${contextLabel} actions`}
            icon={<MoreHorizontalIcon />}
            size="xs"
            variant="ghost"
            minW="32px"
            w="32px"
            h="32px"
            flexShrink={0}
            ml={-0.5}
            color={isDarkTheme ? "fg.secondary" : "accentFg.secondary"}
            _hover={{
              bg: "transparent",
              color: "accent.highlight",
              opacity: 1,
            }}
            _active={{
              bg: "transparent",
              color: "accent.highlight",
              opacity: 0.8,
            }}
          />
        </PopoverTrigger>
        <Portal>
          <PopoverContent
            w="max-content"
            maxW="calc(100vw - 24px)"
            _focus={{ outline: "none" }}
          >
            <PopoverBody p={1.5}>
              <AddressActions
                address={address}
                contextLabel={contextLabel}
                explorer={explorer}
                suggestedLabel={suggestedLabel}
              />
            </PopoverBody>
          </PopoverContent>
        </Portal>
      </Popover>
    </HStack>
  );
}
