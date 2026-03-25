"use client";

import { useState, useEffect, useRef } from "react";
import { Box, HStack, Text, Image, Link } from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTokenData } from "../../contexts/TokenDataContext";
import { DEXSCREENER_URL } from "../../constants";
import { LoadingShapes } from "../../components/ui/LoadingShapes";
import {
  MENUBAR_BG,
  MENUBAR_HEIGHT,
  BUTTON_HIGHLIGHT,
  BUTTON_SHADOW,
  WIN95_FONT,
  WIN95_FONT_SIZE,
  ACCENT_BLUE,
} from "./win95styles";

const MotionText = motion(Text);

interface MenuBarProps {
  onOpenSwap?: () => void;
}

export function MenuBar({ onOpenSwap }: MenuBarProps) {
  const { tokenData, isLoading } = useTokenData();

  // Animated market cap display (same pattern as TokenBanner)
  const [displayValue, setDisplayValue] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const prevDisplayRef = useRef<string | null>(null);
  const prevRawRef = useRef<number | null>(null);

  useEffect(() => {
    if (tokenData?.marketCap !== undefined) {
      const newDisplay = tokenData.marketCap;
      const newRaw = tokenData.marketCapRaw;
      const prevDisplay = prevDisplayRef.current;
      const prevRaw = prevRawRef.current;

      if (
        prevDisplay !== null &&
        prevDisplay !== newDisplay &&
        prevRaw !== null
      ) {
        setDirection(newRaw > prevRaw ? "up" : "down");
        setIsAnimating(true);
        const timer = setTimeout(() => setIsAnimating(false), 600);
        prevDisplayRef.current = newDisplay;
        prevRawRef.current = newRaw;
        setDisplayValue(newDisplay);
        return () => clearTimeout(timer);
      }

      prevDisplayRef.current = newDisplay;
      prevRawRef.current = newRaw;
      setDisplayValue(newDisplay);
    }
  }, [tokenData?.marketCap, tokenData?.marketCapRaw]);

  return (
    <HStack
      h={`${MENUBAR_HEIGHT}px`}
      bg={MENUBAR_BG}
      backdropFilter="blur(12px)"
      borderBottom="1px solid rgba(255,255,255,0.08)"
      px="8px"
      spacing="8px"
      justify="space-between"
      flexShrink={0}
      zIndex={10001}
    >
      {/* Left: branding */}
      <HStack spacing="6px" flexShrink={0}>
        <Image
          src="/images/walletchan-icon-nobg.png"
          alt=""
          w="16px"
          h="16px"
          objectFit="contain"
        />
        <Text
          fontFamily={WIN95_FONT}
          fontSize={WIN95_FONT_SIZE}
          fontWeight="900"
          color="white"
          letterSpacing="0.5px"
        >
          WalletChan OS
        </Text>
      </HStack>

      {/* Center: WCHAN mcap + buy/sell */}
      <HStack
        spacing="0"
        bg="rgba(255,255,255,0.06)"
        border="1px solid rgba(255,255,255,0.1)"
        borderRadius="6px"
        h="22px"
        overflow="hidden"
        flexShrink={0}
      >
        {/* $WCHAN pill */}
        <Link
          href={DEXSCREENER_URL}
          isExternal
          display="flex"
          alignItems="center"
          h="full"
          px="8px"
          bg="#F0C020"
          fontFamily={WIN95_FONT}
          fontSize="10px"
          fontWeight="900"
          color="#000"
          letterSpacing="0.5px"
          _hover={{ bg: "#f5d040", textDecoration: "none" }}
        >
          $WCHAN
        </Link>

        {/* MCap display */}
        <HStack spacing="4px" px="8px" h="full">
          <Text
            fontFamily={WIN95_FONT}
            fontSize="9px"
            fontWeight="700"
            color="rgba(255,255,255,0.45)"
          >
            MCap
          </Text>
          {isLoading || !displayValue ? (
            <LoadingShapes />
          ) : (
            <Box
              position="relative"
              overflow="hidden"
              h="14px"
              minW="50px"
              display="flex"
              alignItems="center"
            >
              <AnimatePresence mode="popLayout">
                <MotionText
                  key={displayValue}
                  fontFamily={WIN95_FONT}
                  fontSize="10px"
                  fontWeight="900"
                  color={isAnimating ? "#4ade80" : "white"}
                  position="absolute"
                  whiteSpace="nowrap"
                  initial={{
                    y: direction === "up" ? 12 : -12,
                    opacity: 0,
                  }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{
                    y: direction === "up" ? -12 : 12,
                    opacity: 0,
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  {displayValue}
                </MotionText>
              </AnimatePresence>
            </Box>
          )}
        </HStack>

        {/* Buy/Sell button */}
        <Box
          as="button"
          display="flex"
          alignItems="center"
          h="full"
          px="8px"
          bg="#208040"
          fontFamily={WIN95_FONT}
          fontSize="10px"
          fontWeight="900"
          color="white"
          letterSpacing="0.5px"
          _hover={{ bg: "#1a6a34" }}
          _active={{ bg: "#155a2a" }}
          onClick={onOpenSwap}
        >
          Buy/Sell
        </Box>
      </HStack>

      {/* Right: connect button */}
      <ConnectButton.Custom>
        {({ account, openAccountModal, openConnectModal, mounted }) => {
          const connected = mounted && account;
          return (
            <Box
              as="button"
              display="flex"
              alignItems="center"
              gap="6px"
              fontFamily={WIN95_FONT}
              fontSize={WIN95_FONT_SIZE}
              onClick={connected ? openAccountModal : openConnectModal}
              h="22px"
              px="10px"
              bg={connected ? "rgba(255,255,255,0.06)" : ACCENT_BLUE}
              border="1px solid"
              borderColor={connected ? "rgba(255,255,255,0.1)" : ACCENT_BLUE}
              borderRadius="6px"
              _hover={{
                bg: connected ? "rgba(255,255,255,0.12)" : "#1350d8",
              }}
              _active={{
                bg: connected ? "rgba(255,255,255,0.16)" : "#0e3aa0",
              }}
              whiteSpace="nowrap"
              flexShrink={0}
              transition="all 0.15s"
            >
              {connected ? (
                <>
                  <Box
                    w="6px"
                    h="6px"
                    bg="#4ade80"
                    borderRadius="full"
                    boxShadow="0 0 4px rgba(74,222,128,0.5)"
                  />
                  <Text fontWeight="bold" color="white">
                    {account.displayName}
                  </Text>
                </>
              ) : (
                <Text color="white" fontWeight="bold">
                  Connect Wallet
                </Text>
              )}
            </Box>
          );
        }}
      </ConnectButton.Custom>
    </HStack>
  );
}
