import { Box, Button, HStack, Icon, Text } from "@chakra-ui/react";
import { LockIcon } from "@chakra-ui/icons";
import type { KeyboardEvent } from "react";

import type { WalletHomeMode } from "@/app/home/walletHomeMode";

interface WalletModeToggleProps {
  mode: WalletHomeMode;
  publicDappConnected: boolean;
  onChange: (mode: WalletHomeMode) => void;
}

const PublicIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="11px" aria-hidden="true">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M4 12h16M12 4c2.3 2.2 3.5 4.9 3.5 8S14.3 17.8 12 20c-2.3-2.2-3.5-4.9-3.5-8S9.7 6.2 12 4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Icon>
);

const MODES: readonly WalletHomeMode[] = ["public", "private"];

export default function WalletModeToggle({
  mode,
  publicDappConnected,
  onChange,
}: WalletModeToggleProps) {
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % MODES.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + MODES.length) % MODES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MODES.length - 1;
    else return;
    event.preventDefault();
    onChange(MODES[next]);
    document.getElementById(`wallet-mode-${MODES[next]}`)?.focus();
  };

  return (
    <HStack
      role="tablist"
      aria-label="Wallet mode"
      spacing={0.5}
      p="2px"
      bg="transparent"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="full"
      flexShrink={0}
    >
      {MODES.map((item, index) => {
        const selected = mode === item;
        const privateMode = item === "private";
        return (
          <Button
            key={item}
            id={`wallet-mode-${item}`}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            variant="ghost"
            minH="28px"
            h="28px"
            minW="66px"
            px={2}
            borderRadius="full"
            bg={selected ? "accent.highlight" : "transparent"}
            color={selected ? "accentFg.highlight" : "fg.secondary"}
            _hover={{
              bg: selected
                ? "accent.highlight"
                : "surface.raisedHover",
              color: selected ? undefined : "fg.primary",
            }}
            _active={{ transform: "none" }}
            onClick={() => onChange(item)}
            onKeyDown={(event) => moveFocus(event, index)}
          >
            <HStack spacing={1}>
              {privateMode ? <LockIcon boxSize="11px" /> : <PublicIcon />}
              <Text as="span" fontSize="2xs" fontWeight="700">
                {privateMode ? "Private" : "Public"}
              </Text>
              {!privateMode && publicDappConnected && (
                <Box
                  boxSize="5px"
                  borderRadius="full"
                  bg={selected ? "accentFg.highlight" : "accent.highlight"}
                  aria-label="Connected app active"
                />
              )}
            </HStack>
          </Button>
        );
      })}
    </HStack>
  );
}
