"use client";

import { useEffect } from "react";
import { Box, VStack, HStack, Text, Image, Link } from "@chakra-ui/react";
import {
  BUTTON_FACE,
  BUTTON_HIGHLIGHT,
  BUTTON_SHADOW,
  BUTTON_DARK_SHADOW,
  WIN95_FONT,
  WIN95_FONT_SIZE,
  windowFrame,
  raisedBorder,
  sunkenBorder,
  ACTIVE_TITLE_BG,
  TITLE_TEXT_COLOR,
} from "./win95styles";

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  // Close on Escape
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
      <Box
        position="fixed"
        inset={0}
        bg="rgba(0,0,0,0.3)"
        zIndex={99999}
        onClick={onClose}
      />

      {/* Dialog */}
      <Box
        position="fixed"
        top="50%"
        left="50%"
        transform="translate(-50%, -50%)"
        zIndex={100000}
        w="340px"
        {...windowFrame}
      >
        {/* Title bar */}
        <HStack
          h="20px"
          px="3px"
          py="2px"
          spacing="4px"
          bgImage={ACTIVE_TITLE_BG}
          userSelect="none"
        >
          <Image
            src="/images/walletchan-icon-nobg.png"
            alt=""
            w="14px"
            h="14px"
            borderRadius="2px"
            flexShrink={0}
          />
          <Text
            flex={1}
            color={TITLE_TEXT_COLOR}
            fontFamily={WIN95_FONT}
            fontSize={WIN95_FONT_SIZE}
            fontWeight="bold"
            lineHeight="16px"
          >
            About WalletChan OS
          </Text>
          {/* Close button */}
          <Box
            as="button"
            w="12px"
            h="12px"
            borderRadius="full"
            bg="#FF5F57"
            border="1px solid"
            borderColor="blackAlpha.200"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="8px"
            fontWeight="900"
            lineHeight="1"
            color="transparent"
            flexShrink={0}
            _hover={{ color: "blackAlpha.800" }}
            onClick={onClose}
          >
            ✕
          </Box>
        </HStack>

        {/* Content */}
        <VStack
          bg={BUTTON_FACE}
          p="20px"
          spacing="12px"
          align="center"
        >
          <Image
            src="/images/walletchan-icon-nobg.png"
            alt="WalletChan"
            w="64px"
            h="64px"
            objectFit="contain"
          />
          <VStack spacing="4px" align="center">
            <Text
              fontFamily={WIN95_FONT}
              fontSize="14px"
              fontWeight="bold"
              color="#000"
            >
              WalletChan OS
            </Text>
            <Text
              fontFamily={WIN95_FONT}
              fontSize={WIN95_FONT_SIZE}
              color="#000"
            >
              Version 1.0
            </Text>
            <Text
              fontFamily={WIN95_FONT}
              fontSize={WIN95_FONT_SIZE}
              color="#808080"
              textAlign="center"
              mt="4px"
            >
              The Web3 Operating System.
              <br />
              Your dapps, one place.
            </Text>
            <Link
              href="/"
              fontFamily={WIN95_FONT}
              fontSize={WIN95_FONT_SIZE}
              color="#000080"
              fontWeight="bold"
              mt="4px"
              _hover={{ textDecoration: "underline" }}
            >
              walletchan.com
            </Link>
          </VStack>

          {/* Divider */}
          <Box
            w="full"
            borderTop={`1px solid ${BUTTON_SHADOW}`}
            borderBottom={`1px solid ${BUTTON_HIGHLIGHT}`}
          />

          {/* OK button */}
          <Box
            as="button"
            px="24px"
            py="3px"
            fontFamily={WIN95_FONT}
            fontSize={WIN95_FONT_SIZE}
            fontWeight="bold"
            bg={BUTTON_FACE}
            color="#000"
            {...raisedBorder}
            _active={sunkenBorder}
            _hover={{ bg: "#d4d4d4" }}
            onClick={onClose}
          >
            OK
          </Box>
        </VStack>
      </Box>
    </>
  );
}
