import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Box,
  HStack,
  IconButton,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
  type BoxProps,
} from "@chakra-ui/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

interface TokenContractPopoverProps {
  address: string;
  explorer?: string;
  symbol: string;
  children: ReactNode;
  triggerColor?: BoxProps["color"];
}

/** Compact hover/focus disclosure for an ERC-20 symbol and its contract tools. */
export function TokenContractPopover({
  address,
  explorer,
  symbol,
  children,
  triggerColor = "fg.secondary",
}: TokenContractPopoverProps) {
  const [copied, setCopied] = useState(false);
  const copiedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortAddress = `${address.slice(0, 8)}...${address.slice(-6)}`;
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
    <Popover
      trigger="hover"
      placement="bottom-end"
      openDelay={120}
      closeDelay={220}
      gutter={6}
      isLazy
    >
      <PopoverTrigger>
        <Box
          as="button"
          type="button"
          aria-label={`Show ${symbol} token contract`}
          display="inline-flex"
          alignItems="center"
          color={triggerColor}
          borderRadius="sm"
          cursor="help"
          _hover={{ color: "accent.highlight" }}
          _focusVisible={{
            color: "accent.highlight",
            outline: "2px solid",
            outlineColor: "accent.highlight",
            outlineOffset: "2px",
          }}
        >
          {children}
        </Box>
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          w="max-content"
          maxW="calc(100vw - 24px)"
          _focus={{ outline: "none" }}
        >
          <PopoverBody p={1.5}>
            <HStack spacing={1} whiteSpace="nowrap">
              <Text
                px={1.5}
                fontSize="xs"
                fontFamily="mono"
                color="fg.primary"
                fontWeight="600"
              >
                {shortAddress}
              </Text>
              <IconButton
                aria-label={`Copy ${symbol} token address`}
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
                  aria-label={`View ${symbol} token on explorer`}
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
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}
