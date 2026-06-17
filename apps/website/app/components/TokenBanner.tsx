"use client";

import { Box, HStack, Text, Link, useDisclosure } from "@chakra-ui/react";
import { useTokenData } from "../contexts/TokenDataContext";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { DEXSCREENER_URL, TOKEN_ADDRESS } from "../constants";
import { useSiteNav } from "../lib/useSiteNav";
import { BuyModal, type BuyToken } from "../coins/components/BuyModal";
import { LoadingShapes } from "./ui/LoadingShapes";

const MotionText = motion(Text);
const MotionBox = motion(Box);

const WCHAN_TOKEN: BuyToken = {
  address: TOKEN_ADDRESS,
  name: "WalletChan",
  symbol: "WCHAN",
  imageUrl: "/images/walletchan-icon-nobg.png",
};

function BuyWCHANAutoOpen({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  const opened = useRef(false);

  useEffect(() => {
    if (!opened.current && searchParams.get("buyWCHAN") === "true") {
      opened.current = true;
      onOpen();
    }
  }, [searchParams, onOpen]);

  return null;
}

export function TokenBanner() {
  const { tokenData, isLoading } = useTokenData();
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Sync ?buyWCHAN=true in the URL bar when the modal opens/closes.
  // Uses replaceState directly to avoid triggering Next.js re-renders.
  const handleOpen = useCallback(() => {
    onOpen();
    const url = new URL(window.location.href);
    url.searchParams.set("buyWCHAN", "true");
    window.history.replaceState({}, "", url.toString());
  }, [onOpen]);

  const handleClose = useCallback(() => {
    onClose();
    const url = new URL(window.location.href);
    url.searchParams.delete("buyWCHAN");
    window.history.replaceState({}, "", url.toString());
  }, [onClose]);

  const { href, isOnPage } = useSiteNav();

  const isMigratePage = isOnPage("/migrate");
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

      // Only animate if the displayed value actually changes
      if (
        prevDisplay !== null &&
        prevDisplay !== newDisplay &&
        prevRaw !== null
      ) {
        setDirection(newRaw > prevRaw ? "up" : "down");
        setIsAnimating(true);

        // Reset animation after it completes
        const timer = setTimeout(() => {
          setIsAnimating(false);
        }, 600);

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
    <Box position="sticky" top={0} zIndex={100}>
      <React.Suspense fallback={null}>
        <BuyWCHANAutoOpen onOpen={handleOpen} />
      </React.Suspense>
      <HStack
        bg="bauhaus.yellow"
        py={2}
        px={4}
        justify="center"
        spacing={{ base: 2, md: 3 }}
        flexWrap="wrap"
        rowGap={2}
      >
        {/* Left decorative square */}
        <Box
          w="6px"
          h="6px"
          bg="bauhaus.black"
          display={{ base: "none", md: "block" }}
        />

        {/* Powered by + $WCHAN group */}
        <HStack spacing={2}>
          <Text
            fontSize="xs"
            fontWeight="700"
            color="bauhaus.black"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Powered by
          </Text>

          <Link
            href={DEXSCREENER_URL}
            isExternal
            bg="bauhaus.blue"
            color="white"
            px={3}
            py={1}
            fontWeight="900"
            fontSize="xs"
            textTransform="uppercase"
            letterSpacing="wide"
            border="2px solid"
            borderColor="bauhaus.black"
            boxShadow="2px 2px 0px 0px #121212"
            _hover={{
              bg: "#F97316",
              color: "white",
              textDecoration: "none",
              transform: "translateY(-1px)",
              boxShadow: "3px 3px 0px 0px #121212",
            }}
            _active={{
              transform: "translate(2px, 2px)",
              boxShadow: "none",
            }}
            transition="all 0.2s ease-out"
          >
            $WCHAN
          </Link>
        </HStack>

        {/* Market Cap + Buy group */}
        <HStack spacing={2}>
          <HStack
            spacing={1}
            bg="white"
            border="2px solid"
            borderColor={isAnimating ? "bauhaus.green" : "bauhaus.black"}
            boxShadow={
              isAnimating
                ? "2px 2px 0px 0px #208040"
                : "2px 2px 0px 0px #121212"
            }
            px={3}
            py={1}
            transition="all 0.2s ease-out"
          >
            <Text
              fontSize="xs"
              fontWeight="700"
              color="bauhaus.black"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              MCap:
            </Text>
            {isLoading || !displayValue ? (
              <LoadingShapes />
            ) : (
              <Box
                position="relative"
                overflow="hidden"
                h="18px"
                minW="70px"
                display="flex"
                alignItems="center"
              >
                <AnimatePresence mode="popLayout">
                  <MotionText
                    key={displayValue}
                    fontSize="sm"
                    fontWeight="black"
                    color={isAnimating ? "bauhaus.green" : "bauhaus.blue"}
                    position="absolute"
                    whiteSpace="nowrap"
                    initial={{
                      y: direction === "up" ? 16 : -16,
                      opacity: 0,
                    }}
                    animate={{
                      y: 0,
                      opacity: 1,
                    }}
                    exit={{
                      y: direction === "up" ? -16 : 16,
                      opacity: 0,
                    }}
                    transition={{
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                  >
                    {displayValue}
                  </MotionText>
                </AnimatePresence>
              </Box>
            )}
          </HStack>

          <Box
            as="button"
            bg="bauhaus.green"
            color="white"
            px={3}
            py={1}
            fontWeight="700"
            fontSize="xs"
            textTransform="uppercase"
            letterSpacing="wider"
            border="2px solid"
            borderColor="bauhaus.black"
            boxShadow="2px 2px 0px 0px #121212"
            display="flex"
            alignItems="center"
            gap={1}
            onClick={handleOpen}
            _hover={{
              opacity: 0.9,
              transform: "translateY(-1px)",
              boxShadow: "3px 3px 0px 0px #121212",
            }}
            _active={{
              transform: "translate(2px, 2px)",
              boxShadow: "none",
            }}
            transition="all 0.2s ease-out"
          >
            Buy/Sell
          </Box>
        </HStack>

        {/* Right decorative square */}
        <Box
          w="6px"
          h="6px"
          bg="bauhaus.black"
          display={{ base: "none", md: "block" }}
        />
      </HStack>
      {/* Divider — yellow bg with black ellipse tapering to edges */}
      <Box h="3px" bg="bauhaus.yellow" position="relative">
        <Box
          position="absolute"
          inset={0}
          bg="#121212"
          sx={{
            clipPath: "ellipse(36% 50% at 50% 50%)",
          }}
        />
      </Box>
      <BuyModal
        token={WCHAN_TOKEN}
        isOpen={isOpen}
        onClose={handleClose}
        showWallet
      />

      {/* Migrate banner */}
      {!isMigratePage && <Box
        position="relative"
        overflow="hidden"
        borderBottom="3px solid"
        borderColor="bauhaus.black"
      >
        {/* Left crumbling bricks — solid rect + absolute-positioned squares */}
        <Box
          position="absolute"
          left={0}
          top={0}
          bottom={0}
          w="300px"
          pointerEvents="none"
          zIndex={1}
          display={{ base: "none", md: "block" }}
        >
          {/* Solid yellow block at the edge */}
          <Box
            position="absolute"
            left={0}
            top={0}
            bottom={0}
            w="60px"
            bg="#F0C020"
          />
          {/* Brick squares that break apart — wall shatter effect */}
          {[
            // [x, y(%), size] — bricks get smaller and sparser going right
            // Near-full-height columns touching the solid rect
            // x aligned within each column to prevent bottom-edge gaps
            [60, 0, 28],
            [60, 52, 26],
            // Still tall, slight gaps appearing
            [78, 0, 24],
            [78, 55, 22],
            [94, 2, 20],
            [94, 52, 20],
            // Getting smaller, more gaps
            [108, 0, 18],
            [108, 55, 16],
            [120, 5, 15],
            [120, 50, 14],
            // Breaking apart — 3 rows emerging
            // x aligned within column; bottom bricks pushed lower for full coverage
            [132, 0, 13],
            [132, 38, 12],
            [132, 74, 12],
            [146, 8, 12],
            [146, 45, 11],
            [146, 78, 10],
            [160, 2, 10],
            [160, 40, 10],
            [160, 76, 9],
            // Medium fragments scattered
            [174, 15, 9],
            [176, 50, 8],
            [172, 78, 8],
            [188, 5, 8],
            [186, 42, 7],
            [190, 70, 7],
            [200, 20, 7],
            [202, 55, 6],
            [198, 0, 6],
            // Small fragments
            [212, 22, 6],
            [210, 55, 6],
            [214, 0, 5],
            [224, 10, 5],
            [226, 42, 5],
            [222, 72, 5],
            [236, 28, 5],
            [238, 60, 4],
            [234, 0, 4],
            // Tiny pixels
            [248, 15, 4],
            [250, 48, 4],
            [246, 75, 3],
            [258, 5, 3],
            [260, 35, 3],
            [256, 65, 3],
            [268, 22, 3],
            [270, 52, 2],
            [266, 78, 2],
            [278, 10, 2],
            [280, 42, 2],
            [276, 68, 2],
            [288, 30, 2],
            [290, 58, 2],
            [296, 15, 1],
            [295, 50, 1],
            [297, 75, 1],
          ].map(([x, yPct, size], i) => (
            <Box
              key={i}
              position="absolute"
              left={`${x}px`}
              top={`${yPct}%`}
              w={`${size}px`}
              h={`${size}px`}
              bg="#F0C020"
            />
          ))}
        </Box>
        {/* Right crumbling bricks (mirrored) */}
        <Box
          position="absolute"
          right={0}
          top={0}
          bottom={0}
          w="300px"
          pointerEvents="none"
          zIndex={1}
          transform="scaleX(-1)"
          display={{ base: "none", md: "block" }}
        >
          <Box
            position="absolute"
            left={0}
            top={0}
            bottom={0}
            w="60px"
            bg="#F0C020"
          />
          {[
            [60, 0, 28],
            [60, 52, 26],
            [78, 0, 24],
            [78, 55, 22],
            [94, 2, 20],
            [94, 52, 20],
            [108, 0, 18],
            [108, 55, 16],
            [120, 5, 15],
            [120, 50, 14],
            [132, 0, 13],
            [132, 38, 12],
            [132, 74, 12],
            [146, 8, 12],
            [146, 45, 11],
            [146, 78, 10],
            [160, 2, 10],
            [160, 40, 10],
            [160, 76, 9],
            [174, 15, 9],
            [176, 50, 8],
            [172, 78, 8],
            [188, 5, 8],
            [186, 42, 7],
            [190, 70, 7],
            [200, 20, 7],
            [202, 55, 6],
            [198, 0, 6],
            [212, 22, 6],
            [210, 55, 6],
            [214, 0, 5],
            [224, 10, 5],
            [226, 42, 5],
            [222, 72, 5],
            [236, 28, 5],
            [238, 60, 4],
            [234, 0, 4],
            [248, 15, 4],
            [250, 48, 4],
            [246, 75, 3],
            [258, 5, 3],
            [260, 35, 3],
            [256, 65, 3],
            [268, 22, 3],
            [270, 52, 2],
            [266, 78, 2],
            [278, 10, 2],
            [280, 42, 2],
            [276, 68, 2],
            [288, 30, 2],
            [290, 58, 2],
            [296, 15, 1],
            [295, 50, 1],
            [297, 75, 1],
          ].map(([x, yPct, size], i) => (
            <Box
              key={i}
              position="absolute"
              left={`${x}px`}
              top={`${yPct}%`}
              w={`${size}px`}
              h={`${size}px`}
              bg="#F0C020"
            />
          ))}
        </Box>
        <HStack bg="white" py={{ base: 1, md: 1.5 }} px={{ base: 2, md: 4 }} justify="center" spacing={{ base: 1.5, md: 2 }}>
          <HStack
            flexDir={"row"}
            fontSize={{ base: "2xs", md: "xs" }}
            fontWeight="800"
            color="bauhaus.black"
            textTransform="uppercase"
            letterSpacing={{ base: "wide", md: "wider" }}
            flexShrink={0}
          >
            <Text bg="#ffdf00">New Ticker,</Text> <Text>Same Vision</Text>
          </HStack>
          <Link
            href={href("/migrate")}
            bg="bauhaus.red"
            color="white"
            px={{ base: 2, md: 3 }}
            py={0.5}
            fontWeight="900"
            fontSize={{ base: "2xs", md: "xs" }}
            textTransform="uppercase"
            letterSpacing="wide"
            border="2px solid"
            borderColor="bauhaus.black"
            boxShadow="2px 2px 0px 0px #121212"
            whiteSpace="nowrap"
            _hover={{
              opacity: 0.9,
              textDecoration: "none",
              transform: "translateY(-1px)",
              boxShadow: "3px 3px 0px 0px #121212",
            }}
            _active={{
              transform: "translate(2px, 2px)",
              boxShadow: "none",
            }}
            transition="all 0.2s ease-out"
          >
            Wrap $BNKRW to $WCHAN ✨
          </Link>
        </HStack>
      </Box>}
    </Box>
  );
}
