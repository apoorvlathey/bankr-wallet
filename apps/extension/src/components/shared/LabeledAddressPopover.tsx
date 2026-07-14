import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Box,
  HStack,
  Icon,
  IconButton,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isDarkThemeId, useTheme } from "@/theme";

interface AddressActionsProps {
  address: string;
  compact?: boolean;
  contextLabel?: string;
  explorer?: string;
}

export function AddressActions({
  address,
  compact = false,
  contextLabel = "address",
  explorer,
}: AddressActionsProps) {
  const [copied, setCopied] = useState(false);
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
    <HStack spacing={0.5} minW={0} justify="flex-end" whiteSpace="nowrap">
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
      <IconButton
        aria-label={`Copy ${contextLabel}`}
        icon={
          copied ? (
            <CheckIcon boxSize="10px" />
          ) : (
            <CopyIcon boxSize="11px" />
          )
        }
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
  );
}

const MoreHorizontalIcon = () => (
  <Icon viewBox="0 0 20 20" boxSize="16px" aria-hidden="true">
    <circle cx="4" cy="10" r="1.5" fill="currentColor" />
    <circle cx="10" cy="10" r="1.5" fill="currentColor" />
    <circle cx="16" cy="10" r="1.5" fill="currentColor" />
  </Icon>
);

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

  return (
    <HStack
      spacing={0}
      minW={0}
      maxW={maxW}
      pl={2}
      bg={isDarkTheme ? "surface.raisedHover" : "accent.secondary"}
      color={isDarkTheme ? "fg.primary" : "accentFg.secondary"}
      border="1px solid"
      borderColor={isDarkTheme ? "border.default" : "accent.secondary"}
      borderRadius="md"
    >
      <Text
        minW={0}
        fontSize="2xs"
        fontWeight="700"
        noOfLines={1}
        title={label}
      >
        {label}
      </Text>

      <Popover
        trigger="hover"
        placement="bottom-end"
        openDelay={120}
        closeDelay={220}
        gutter={6}
        isLazy
      >
        <PopoverTrigger>
          <Box as="span" display="inline-flex" flexShrink={0}>
            <IconButton
              aria-label={`Show ${contextLabel} actions`}
              icon={<MoreHorizontalIcon />}
              size="xs"
              variant="ghost"
              minW="32px"
              w="32px"
              h="32px"
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
          </Box>
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
              />
            </PopoverBody>
          </PopoverContent>
        </Portal>
      </Popover>
    </HStack>
  );
}
