"use client";

import { useEffect, useRef } from "react";
import { Box, VStack, Text, Image } from "@chakra-ui/react";
import {
  BUTTON_FACE,
  BUTTON_HIGHLIGHT,
  BUTTON_SHADOW,
  BUTTON_DARK_SHADOW,
  WIN95_FONT,
  WIN95_FONT_SIZE,
} from "./win95styles";

export interface ContextMenuAction {
  label: string;
  icon?: string;
  onClick: () => void;
  dividerAfter?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function ContextMenu({ x, y, actions, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Adjust position if menu would overflow viewport
  const adjustedX = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 180);
  const adjustedY = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 800) - actions.length * 28 - 10);

  return (
    <>
      {/* Backdrop */}
      <Box
        position="fixed"
        inset={0}
        zIndex={99998}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Menu */}
      <VStack
        ref={menuRef}
        position="fixed"
        left={`${adjustedX}px`}
        top={`${adjustedY}px`}
        zIndex={99999}
        bg={BUTTON_FACE}
        border={`1px solid ${BUTTON_DARK_SHADOW}`}
        boxShadow={`2px 2px 0 ${BUTTON_DARK_SHADOW}`}
        minW="160px"
        spacing={0}
        align="stretch"
        py="2px"
      >
        {actions.map((action, i) => (
          <Box key={i}>
            <Box
              as="button"
              display="flex"
              alignItems="center"
              gap="8px"
              w="full"
              textAlign="left"
              px="24px"
              py="4px"
              fontFamily={WIN95_FONT}
              fontSize={WIN95_FONT_SIZE}
              color={action.danger ? "#D02020" : "#000"}
              _hover={{ bg: "#000080", color: "white" }}
              onClick={() => {
                action.onClick();
                onClose();
              }}
            >
              {action.icon ? (
                <Image src={action.icon} alt="" w="14px" h="14px" borderRadius="2px" flexShrink={0} />
              ) : (
                <Box w="14px" h="14px" flexShrink={0} />
              )}
              <Text fontWeight="bold">{action.label}</Text>
            </Box>
            {action.dividerAfter && (
              <Box
                mx="2px"
                my="2px"
                borderTop={`1px solid ${BUTTON_SHADOW}`}
                borderBottom={`1px solid ${BUTTON_HIGHLIGHT}`}
              />
            )}
          </Box>
        ))}
      </VStack>
    </>
  );
}
