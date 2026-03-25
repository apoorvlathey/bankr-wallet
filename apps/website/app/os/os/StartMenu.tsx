"use client";

import { useEffect, useRef } from "react";
import { Box, VStack, HStack, Text, Image } from "@chakra-ui/react";
import {
  BUTTON_FACE,
  BUTTON_HIGHLIGHT,
  BUTTON_SHADOW,
  BUTTON_DARK_SHADOW,
  WIN95_FONT,
  WIN95_FONT_SIZE,
} from "./win95styles";

interface StartMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAppStore: () => void;
  onOpenAbout: () => void;
  installedApps: { id: number; name: string; iconUrl: string }[];
  onOpenApp: (dappId: number) => void;
}

function MenuItem({
  icon,
  label,
  onClick,
  hasSubmenu,
}: {
  icon?: string;
  label: string;
  onClick?: () => void;
  hasSubmenu?: boolean;
}) {
  return (
    <Box
      as="button"
      display="flex"
      alignItems="center"
      gap="8px"
      w="full"
      textAlign="left"
      px="24px"
      py="5px"
      fontFamily={WIN95_FONT}
      fontSize={WIN95_FONT_SIZE}
      color="#000"
      _hover={{ bg: "#000080", color: "white" }}
      onClick={onClick}
    >
      {icon ? (
        <Image src={icon} alt="" w="16px" h="16px" borderRadius="2px" flexShrink={0} />
      ) : (
        <Box w="16px" h="16px" flexShrink={0} />
      )}
      <Text flex={1} fontWeight="bold" noOfLines={1}>
        {label}
      </Text>
      {hasSubmenu && (
        <Text fontSize="8px" color="inherit" flexShrink={0}>
          ▶
        </Text>
      )}
    </Box>
  );
}

export function StartMenu({
  isOpen,
  onClose,
  onOpenAppStore,
  onOpenAbout,
  installedApps,
  onOpenApp,
}: StartMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <Box position="fixed" inset={0} zIndex={9999} onClick={onClose} />

      {/* Menu */}
      <Box
        ref={menuRef}
        position="absolute"
        bottom="100%"
        left="0"
        zIndex={10000}
        display="flex"
        border={`1px solid ${BUTTON_DARK_SHADOW}`}
        boxShadow={`2px -2px 0 ${BUTTON_DARK_SHADOW}`}
        mb="2px"
      >
        {/* Left sidebar — classic Win95 vertical branding strip */}
        <Box
          w="28px"
          bgImage="linear-gradient(to top, #000080, #1084d0)"
          display="flex"
          alignItems="flex-end"
          justifyContent="center"
          pb="8px"
          flexShrink={0}
        >
          <Text
            fontFamily={WIN95_FONT}
            fontSize="14px"
            fontWeight="bold"
            color="white"
            letterSpacing="2px"
            sx={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
            }}
          >
            WalletChan
          </Text>
        </Box>

        {/* Menu items */}
        <VStack
          bg={BUTTON_FACE}
          spacing={0}
          align="stretch"
          minW="180px"
          py="2px"
          borderLeft={`1px solid ${BUTTON_HIGHLIGHT}`}
        >
          <MenuItem
            icon="/images/walletchan-icon-nobg.png"
            label="App Store"
            onClick={() => {
              onOpenAppStore();
              onClose();
            }}
          />

          {/* Divider */}
          <Box
            mx="2px"
            my="3px"
            borderTop={`1px solid ${BUTTON_SHADOW}`}
            borderBottom={`1px solid ${BUTTON_HIGHLIGHT}`}
          />

          {/* Installed apps section */}
          {installedApps.slice(0, 8).map((app) => (
            <MenuItem
              key={app.id}
              icon={app.iconUrl}
              label={app.name}
              onClick={() => {
                onOpenApp(app.id);
                onClose();
              }}
            />
          ))}

          {/* Divider */}
          <Box
            mx="2px"
            my="3px"
            borderTop={`1px solid ${BUTTON_SHADOW}`}
            borderBottom={`1px solid ${BUTTON_HIGHLIGHT}`}
          />

          <MenuItem
            icon="/images/walletchan-icon-nobg.png"
            label="About WalletChan"
            onClick={() => {
              onOpenAbout();
              onClose();
            }}
          />
        </VStack>
      </Box>
    </>
  );
}
