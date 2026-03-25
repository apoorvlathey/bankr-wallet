"use client";

import { useCallback, useRef } from "react";
import { Box, VStack, Text } from "@chakra-ui/react";
import { WIN95_FONT } from "./win95styles";

interface DesktopIconProps {
  iconUrl: string;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  /** Colored circle background behind the icon (e.g. "bauhaus.blue") */
  iconBg?: string;
  /** Show zap icon for auto-connect dapps */
  autoConnect?: boolean;
  /** Index in the icon list — used for drag reordering */
  index?: number;
  /** Whether this icon supports drag reordering */
  draggable?: boolean;
  onDragStart?: (index: number) => void;
  onDragOver?: (index: number) => void;
  onDragEnd?: () => void;
  isDragOver?: boolean;
}

export function DesktopIcon({
  iconUrl,
  label,
  isSelected,
  onSelect,
  onOpen,
  iconBg,
  autoConnect = false,
  index,
  draggable: isDraggable = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragOver = false,
}: DesktopIconProps) {
  const lastClickRef = useRef(0);

  const handleClick = useCallback(() => {
    const now = Date.now();
    if (now - lastClickRef.current < 400) {
      onOpen();
      lastClickRef.current = 0;
    } else {
      onSelect();
      lastClickRef.current = now;
    }
  }, [onSelect, onOpen]);

  return (
    <VStack
      spacing={1}
      w="80px"
      py={2}
      px={1}
      align="center"
      bg={isSelected ? "rgba(0, 0, 128, 0.4)" : "transparent"}
      outline={isSelected ? "1px dotted white" : "none"}
      borderRadius="2px"
      cursor="pointer"
      sx={isDraggable ? { "&:active": { cursor: "grabbing" } } : {}}
      onClick={handleClick}
      _focus={{ outline: isSelected ? "1px dotted white" : "none" }}
      draggable={isDraggable}
      onDragStart={(e) => {
        if (!isDraggable || index === undefined) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        onDragStart?.(index);
      }}
      onDragOver={(e) => {
        if (!isDraggable || index === undefined) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver?.(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDragEnd?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      opacity={isDragOver ? 0.5 : 1}
      borderTop={isDragOver ? "2px solid rgba(255,255,255,0.6)" : "2px solid transparent"}
      transition="opacity 0.1s"
    >
      <Box position="relative">
        {iconBg ? (
          <Box
            w="48px"
            h="48px"
            borderRadius="10px"
            bg={iconBg}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconUrl}
              alt={label}
              width={38}
              height={38}
              style={{
                width: 38,
                height: 38,
                borderRadius: "4px",
                objectFit: "cover",
                imageRendering: "auto",
              }}
              draggable={false}
            />
          </Box>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={iconUrl}
            alt={label}
            width={48}
            height={48}
            style={{
              width: 48,
              height: 48,
              borderRadius: "8px",
              objectFit: "cover",
              imageRendering: "auto",
            }}
            draggable={false}
          />
        )}
        {autoConnect && (
          <Box
            position="absolute"
            bottom="-2px"
            right="-2px"
            fontSize="10px"
            lineHeight="1"
            bg="rgba(0,0,0,0.35)"
            borderRadius="full"
            w="16px"
            h="16px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            ⚡
          </Box>
        )}
      </Box>
      <Text
        fontFamily={WIN95_FONT}
        fontSize="11px"
        color="white"
        textAlign="center"
        lineHeight="1.2"
        noOfLines={2}
        textShadow="1px 1px 2px rgba(0,0,0,0.8)"
        wordBreak="break-word"
      >
        {label}
      </Text>
    </VStack>
  );
}
