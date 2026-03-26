"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { Box, HStack, Text, Image } from "@chakra-ui/react";
import {
  TASKBAR_BG,
  TASKBAR_HEIGHT,
  BUTTON_FACE,
  BUTTON_HIGHLIGHT,
  BUTTON_SHADOW,
  BUTTON_DARK_SHADOW,
  WIN95_FONT,
  WIN95_FONT_SIZE,
  raisedBorder,
  sunkenBorder,
} from "./win95styles";
import { APP_STORE_WINDOW_ID, SWAP_WINDOW_ID, STAKE_WINDOW_ID } from "./types";
import type { WindowState } from "./types";
import { DAPPS, CHAIN_NAMES } from "../data/dapps";
import { ChainIcon } from "../components/ChainIcon";
import { StartMenu } from "./StartMenu";

interface TaskbarProps {
  windows: WindowState[];
  focusedWindowId: string | null;
  onStartClick: () => void;
  onWindowButtonClick: (id: string) => void;
  onOpenAbout: () => void;
  onOpenApp: (dappId: number) => void;
  installedApps: { id: number; name: string; iconUrl: string }[];
  onOpenWidgetStore: () => void;
}

function Clock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text
      fontFamily={WIN95_FONT}
      fontSize={WIN95_FONT_SIZE}
      color="rgba(255,255,255,0.7)"
      whiteSpace="nowrap"
    >
      {time}
    </Text>
  );
}

export function Taskbar({
  windows,
  focusedWindowId,
  onStartClick,
  onWindowButtonClick,
  onOpenAbout,
  onOpenApp,
  installedApps,
  onOpenWidgetStore,
}: TaskbarProps) {
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const startMenuRef = useRef<HTMLDivElement>(null);

  // Close start menu on click outside
  useEffect(() => {
    if (!startMenuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (startMenuRef.current && !startMenuRef.current.contains(e.target as Node)) {
        setStartMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [startMenuOpen]);

  const handleStartClick = useCallback(() => {
    setStartMenuOpen((prev) => !prev);
  }, []);

  return (
    <Box
      h={`${TASKBAR_HEIGHT}px`}
      bg={TASKBAR_BG}
      backdropFilter="blur(12px)"
      borderTop="1px solid rgba(255,255,255,0.08)"
      display="flex"
      alignItems="center"
      px="8px"
      gap="4px"
      flexShrink={0}
      zIndex={10000}
    >
      {/* Start Button + Menu */}
      <Box ref={startMenuRef} position="relative" flexShrink={0}>
        <Box
          as="button"
          display="flex"
          alignItems="center"
          gap="4px"
          h="28px"
          px="8px"
          bg={startMenuOpen ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)"}
          border="1px solid"
          borderColor={startMenuOpen ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)"}
          borderRadius="4px"
          fontFamily={WIN95_FONT}
          fontSize={WIN95_FONT_SIZE}
          fontWeight="bold"
          color="white"
          _hover={{ bg: "rgba(255,255,255,0.15)" }}
          _active={{ bg: "rgba(255,255,255,0.2)" }}
          onClick={handleStartClick}
        >
          <Image
            src="/images/walletchan-icon-nobg.png"
            alt=""
            w="18px"
            h="18px"
            objectFit="contain"
          />
          <Text>Start</Text>
        </Box>
        <StartMenu
          isOpen={startMenuOpen}
          onClose={() => setStartMenuOpen(false)}
          onOpenAppStore={() => {
            onStartClick();
            setStartMenuOpen(false);
          }}
          onOpenAbout={onOpenAbout}
          installedApps={installedApps}
          onOpenApp={(dappId) => {
            onOpenApp(dappId);
            setStartMenuOpen(false);
          }}
        />
      </Box>

      {/* Divider */}
      <Box
        w="1px"
        h="20px"
        bg="rgba(255,255,255,0.12)"
        flexShrink={0}
      />

      {/* Window buttons */}
      <HStack flex={1} spacing="2px" overflow="hidden">
        {windows.map((win) => {
          const isFocused = win.id === focusedWindowId && !win.isMinimized;
          const isAppStore = win.id === APP_STORE_WINDOW_ID;
          const dapp = win.dappId ? DAPPS.find((d) => d.id === win.dappId) : null;
          const title = isAppStore
            ? "App Store"
            : dapp?.name ?? win.customName ?? "Browser";
          const isSystemWindow = isAppStore || win.id === SWAP_WINDOW_ID || win.id === STAKE_WINDOW_ID;
          const icon = isSystemWindow
            ? "/images/walletchan-icon-nobg.png"
            : dapp?.iconUrl;

          return (
            <Box
              key={win.id}
              as="button"
              display="flex"
              alignItems="center"
              gap="4px"
              h="26px"
              px="8px"
              maxW="160px"
              bg={isFocused ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}
              border="1px solid"
              borderColor={isFocused ? "rgba(255,255,255,0.2)" : "transparent"}
              borderRadius="4px"
              fontFamily={WIN95_FONT}
              fontSize={WIN95_FONT_SIZE}
              color="white"
              _hover={{ bg: "rgba(255,255,255,0.12)" }}
              onClick={() => onWindowButtonClick(win.id)}
              overflow="hidden"
            >
              {icon && (
                <Image
                  src={icon}
                  alt=""
                  w="14px"
                  h="14px"
                  borderRadius="2px"
                  flexShrink={0}
                />
              )}
              <Text noOfLines={1} fontSize="10px">
                {title}
              </Text>
            </Box>
          );
        })}
      </HStack>

      {/* Divider */}
      <Box
        w="1px"
        h="20px"
        bg="rgba(255,255,255,0.12)"
        flexShrink={0}
      />

      {/* Add Widgets button */}
      <Box
        as="button"
        display="flex"
        alignItems="center"
        gap="4px"
        h="26px"
        px="10px"
        borderRadius="4px"
        bg="rgba(16, 64, 192, 0.35)"
        border="1px solid rgba(16, 64, 192, 0.6)"
        flexShrink={0}
        _hover={{ bg: "rgba(16, 64, 192, 0.5)", borderColor: "rgba(16, 64, 192, 0.8)" }}
        _active={{ bg: "rgba(16, 64, 192, 0.6)" }}
        onClick={onOpenWidgetStore}
      >
        <Plus size={12} color="rgba(255,255,255,0.9)" />
        <Text
          fontFamily={WIN95_FONT}
          fontSize="10px"
          fontWeight="bold"
          color="rgba(255,255,255,0.9)"
          whiteSpace="nowrap"
        >
          Widgets
        </Text>
      </Box>

      {/* Clock */}
      <HStack
        h="26px"
        px="8px"
        spacing="8px"
        bg="rgba(255,255,255,0.06)"
        border="1px solid rgba(255,255,255,0.1)"
        borderRadius="4px"
        flexShrink={0}
      >
        <Clock />
      </HStack>
    </Box>
  );
}
