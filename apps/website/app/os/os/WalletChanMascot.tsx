"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, HStack, Text, Image } from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BUTTON_FACE,
  BUTTON_HIGHLIGHT,
  BUTTON_SHADOW,
  BUTTON_DARK_SHADOW,
  WIN95_FONT,
  WIN95_FONT_SIZE,
  TASKBAR_HEIGHT,
} from "./win95styles";

const DISMISS_KEY = "@wchan/mascot-dismissed";

const TIPS = [
  "Welcome to WalletChan OS! Double-click an icon to open a dapp.",
  "Click the Start button to find more apps!",
  "Drag icons to reorder them on your desktop.",
  "You can drag and resize windows freely.",
  "Right-click the desktop or icons for more options!",
  "Use the chain dropdown in each window to switch networks.",
  "Click the Share button to copy a link to any dapp.",
];

const MotionBox = motion.create(Box as any);

export function WalletChanMascot() {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      setDismissed(stored === "true");
    } catch {}
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {}
  }, []);

  const handleNextTip = useCallback(() => {
    setTipIndex((prev) => (prev + 1) % TIPS.length);
  }, []);

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <MotionBox
        position="absolute"
        bottom={`${TASKBAR_HEIGHT + 8}px`}
        right="12px"
        zIndex={9998}
        display="flex"
        alignItems="flex-end"
        gap="8px"
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{
          opacity: 1,
          y: [0, -4, 0],
          scale: 1,
          transition: {
            opacity: { duration: 0.3 },
            scale: { duration: 0.3 },
            y: { duration: 3, repeat: Infinity, ease: "easeInOut" },
          },
        }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
      >
        {/* Speech bubble */}
        <Box
          bg={BUTTON_FACE}
          border={`1px solid ${BUTTON_DARK_SHADOW}`}
          boxShadow={`2px 2px 0 ${BUTTON_DARK_SHADOW}`}
          borderRadius="2px"
          px="12px"
          py="8px"
          maxW="220px"
          position="relative"
        >
          {/* Close button */}
          <Box
            as="button"
            position="absolute"
            top="2px"
            right="4px"
            fontSize="10px"
            fontFamily={WIN95_FONT}
            color="#808080"
            _hover={{ color: "#000" }}
            onClick={handleDismiss}
            lineHeight="1"
          >
            ✕
          </Box>

          <Text
            fontFamily={WIN95_FONT}
            fontSize={WIN95_FONT_SIZE}
            color="#000"
            pr="12px"
            lineHeight="1.4"
          >
            {TIPS[tipIndex]}
          </Text>

          {/* Next tip button */}
          <Box
            as="button"
            mt="6px"
            fontFamily={WIN95_FONT}
            fontSize="10px"
            color="#000080"
            fontWeight="bold"
            _hover={{ textDecoration: "underline" }}
            onClick={handleNextTip}
          >
            Next tip →
          </Box>

          {/* Speech bubble arrow pointing right toward mascot */}
          <Box
            position="absolute"
            right="-6px"
            bottom="12px"
            w={0}
            h={0}
            borderTop="6px solid transparent"
            borderBottom="6px solid transparent"
            borderLeft={`6px solid ${BUTTON_DARK_SHADOW}`}
          />
          <Box
            position="absolute"
            right="-4px"
            bottom="12px"
            w={0}
            h={0}
            borderTop="6px solid transparent"
            borderBottom="6px solid transparent"
            borderLeft={`6px solid ${BUTTON_FACE}`}
          />
        </Box>

        {/* Mascot character */}
        <Image
          src="/images/walletchan-icon-nobg.png"
          alt="WalletChan"
          w="48px"
          h="48px"
          objectFit="contain"
          flexShrink={0}
        />
      </MotionBox>
    </AnimatePresence>
  );
}
