"use client";

import { useCallback, useRef, useState } from "react";
import { Box, HStack, Text, Image, Tooltip, Link } from "@chakra-ui/react";
import { ExternalLink } from "lucide-react";
import { Rnd } from "react-rnd";
import type { WindowState } from "./types";
import { APP_STORE_WINDOW_ID, SWAP_WINDOW_ID, STAKE_WINDOW_ID, WIDGET_STORE_WINDOW_ID } from "./types";
import {
  WINDOW_BG,
  BUTTON_FACE,
  BUTTON_HIGHLIGHT,
  BUTTON_SHADOW,
  BUTTON_DARK_SHADOW,
  ACTIVE_TITLE_BG,
  INACTIVE_TITLE_BG,
  TITLE_TEXT_COLOR,
  WIN95_FONT,
  WIN95_FONT_SIZE,
  TASKBAR_HEIGHT,
  windowFrame,
  raisedBorder,
  sunkenBorder,
} from "./win95styles";
import { CHAIN_NAMES } from "../data/dapps";
import type { DappEntry } from "../data/dapps";
import { ChainIcon } from "../components/ChainIcon";
import { CHAIN_RPC_URLS } from "@/app/wagmiConfig";

interface Win95WindowProps {
  windowState: WindowState;
  dapp: DappEntry | null;
  isFocused: boolean;
  /** Bounds: available desktop area (below navbar, above taskbar) */
  desktopBounds: { width: number; height: number };
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onDragStop: (position: { x: number; y: number }) => void;
  onResizeStop: (
    size: { w: number; h: number },
    position: { x: number; y: number }
  ) => void;
  onChainChange: (chainId: number) => void;
  /** Whether this dapp/url is installed on the desktop */
  isInstalled?: boolean;
  /** Called to install the dapp/url to the desktop */
  onInstall?: () => void;
  children: React.ReactNode;
}

/** macOS-style traffic light button */
function TrafficLightButton({
  color,
  hoverColor,
  icon,
  onClick,
  ariaLabel,
}: {
  color: string;
  hoverColor: string;
  icon: string;
  onClick: (e: React.MouseEvent) => void;
  ariaLabel: string;
}) {
  return (
    <Box
      as="button"
      aria-label={ariaLabel}
      onClick={onClick}
      w="12px"
      h="12px"
      borderRadius="full"
      bg={color}
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
      sx={{
        "div:hover > &": { color: "blackAlpha.800" },
      }}
    >
      {icon}
    </Box>
  );
}

export function Win95Window({
  windowState,
  dapp,
  isFocused,
  desktopBounds,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onDragStop,
  onResizeStop,
  onChainChange,
  isInstalled,
  onInstall,
  children,
}: Win95WindowProps) {
  const { id, position, size, chainId, isMinimized, isMaximized, zIndex } =
    windowState;

  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const [shareTooltip, setShareTooltip] = useState(false);
  const rndRef = useRef<Rnd>(null);

  const isAppStore = id === APP_STORE_WINDOW_ID;
  const isSystemWindow = isAppStore || id === SWAP_WINDOW_ID || id === STAKE_WINDOW_ID || id === WIDGET_STORE_WINDOW_ID;
  const windowTitle = isAppStore
    ? "App Store"
    : dapp?.name ?? windowState.customName ?? "Browser";

  const faviconUrl = isAppStore
    ? "/images/walletchan-icon-nobg.png"
    : dapp?.iconUrl ??
      (() => {
        try {
          return `https://www.google.com/s2/favicons?domain=${new URL(windowState.customUrl || "").hostname}&sz=32`;
        } catch {
          return undefined;
        }
      })();

  // Available chains for this dapp — Ethereum first, then alphabetical
  const availableChains = (dapp
    ? dapp.chains.filter((c) => CHAIN_RPC_URLS[c] !== undefined)
    : Object.keys(CHAIN_RPC_URLS).map(Number)
  ).sort((a, b) => {
    if (a === 1) return -1;
    if (b === 1) return 1;
    return (CHAIN_NAMES[a] || "").localeCompare(CHAIN_NAMES[b] || "");
  });

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose();
    },
    [onClose]
  );

  const handleMinimize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMinimize();
    },
    [onMinimize]
  );

  const handleMaximize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMaximize();
    },
    [onMaximize]
  );

  // Maximized: fill the desktop area
  const rndPosition = isMaximized ? { x: 0, y: 0 } : position;
  const rndSize = isMaximized
    ? { width: desktopBounds.width, height: desktopBounds.height }
    : { width: size.w, height: size.h };

  return (
    <Rnd
      ref={rndRef}
      position={rndPosition}
      size={rndSize}
      minWidth={320}
      minHeight={240}
      style={{
        zIndex: isMinimized ? -1 : zIndex,
        display: "flex",
        visibility: isMinimized ? "hidden" : "visible",
        pointerEvents: isMinimized ? "none" : "auto",
      }}
      dragHandleClassName="win95-title-bar"
      disableDragging={isMaximized}
      enableResizing={!isMaximized}
      onMouseDown={onFocus}
      onDragStop={(_e, d) => onDragStop({ x: d.x, y: d.y })}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        onResizeStop(
          { w: parseInt(ref.style.width), h: parseInt(ref.style.height) },
          { x: pos.x, y: pos.y }
        );
      }}
      bounds="parent"
    >
      <Box
        w="100%"
        h="100%"
        display="flex"
        flexDirection="column"
        {...windowFrame}
        overflow="hidden"
        data-window-id={id}
      >
        {/* Title Bar */}
        <HStack
          className="win95-title-bar"
          h="20px"
          px="3px"
          py="2px"
          spacing="4px"
          bg={isFocused ? undefined : INACTIVE_TITLE_BG}
          bgImage={isFocused ? ACTIVE_TITLE_BG : undefined}
          cursor={isMaximized ? "default" : "grab"}
          flexShrink={0}
          userSelect="none"
          onDoubleClick={handleMaximize}
        >
          {/* Traffic light buttons (macOS style) */}
          <HStack spacing="6px" mr="6px">
            <TrafficLightButton color="#FF5F57" hoverColor="#E04440" icon="✕" onClick={handleClose} ariaLabel="Close" />
            <TrafficLightButton color="#FEBC2E" hoverColor="#D4A123" icon="−" onClick={handleMinimize} ariaLabel="Minimize" />
            <TrafficLightButton
              color="#28C840"
              hoverColor="#1EAD31"
              icon={isMaximized ? "↙" : "↗"}
              onClick={handleMaximize}
              ariaLabel={isMaximized ? "Restore" : "Maximize"}
            />
          </HStack>

          {/* Icon + Title */}
          {faviconUrl && (
            <Image
              src={faviconUrl}
              alt=""
              w="14px"
              h="14px"
              borderRadius="2px"
              flexShrink={0}
            />
          )}
          <Text
            flex={1}
            color={TITLE_TEXT_COLOR}
            fontFamily={WIN95_FONT}
            fontSize={WIN95_FONT_SIZE}
            fontWeight="bold"
            noOfLines={1}
            lineHeight="16px"
          >
            {windowTitle}
          </Text>

          {/* Install button — shown for non-installed dapps */}
          {!isSystemWindow && isInstalled === false && onInstall && (
            <Box
              as="button"
              display="flex"
              alignItems="center"
              gap="2px"
              px="5px"
              py="0px"
              my="2px"
              fontSize="9px"
              fontFamily={WIN95_FONT}
              fontWeight="bold"
              bg={BUTTON_FACE}
              color="#000"
              flexShrink={0}
              {...raisedBorder}
              _hover={{ bg: "#d4d4d4" }}
              _active={sunkenBorder}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onInstall();
              }}
            >
              + Install
            </Box>
          )}
        </HStack>

        {/* Menu bar / chain selector + share (not for system windows) */}
        {!isSystemWindow && (
          <HStack
            bg={WINDOW_BG}
            px="4px"
            py="2px"
            spacing="4px"
            borderBottom={`1px solid ${BUTTON_SHADOW}`}
            flexShrink={0}
            justify="space-between"
          >
            {/* Share button */}
            <Tooltip
              label={shareTooltip ? "Copied!" : "Copy share link"}
              fontSize="xs"
              bg="bauhaus.black"
              color="white"
              borderRadius="0"
              fontWeight="700"
              px={2}
              py={1}
              isOpen={shareTooltip || undefined}
              closeOnClick={false}
            >
              <Box
                as="button"
                display="flex"
                alignItems="center"
                gap="3px"
                px="6px"
                py="1px"
                fontFamily={WIN95_FONT}
                fontSize="10px"
                fontWeight="bold"
                bg="transparent"
                _hover={{ bg: BUTTON_FACE }}
                {...raisedBorder}
                _active={sunkenBorder}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  const appUrl = dapp?.url ?? windowState.customUrl;
                  if (!appUrl) return;
                  const params = new URLSearchParams();
                  params.set("url", appUrl);
                  params.set("chainId", String(chainId));
                  const shareUrl = `${window.location.origin}/os?${params.toString()}`;
                  navigator.clipboard.writeText(shareUrl).then(() => {
                    setShareTooltip(true);
                    setTimeout(() => setShareTooltip(false), 1500);
                  });
                }}
              >
                <Text fontSize="10px" lineHeight="1">📋</Text>
                <Text>Share</Text>
              </Box>
            </Tooltip>

            {/* URL bar */}
            {(dapp?.url || windowState.customUrl) && (
              <HStack
                flex={1}
                spacing="4px"
                px="4px"
                py="1px"
                bg="white"
                {...sunkenBorder}
                minW={0}
              >
                <Text
                  fontFamily={WIN95_FONT}
                  fontSize="10px"
                  color="gray.500"
                  noOfLines={1}
                  flex={1}
                  minW={0}
                >
                  {dapp?.url || windowState.customUrl}
                </Text>
                <Link
                  href={dapp?.url || windowState.customUrl}
                  isExternal
                  display="flex"
                  alignItems="center"
                  flexShrink={0}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={10} color="#808080" />
                </Link>
              </HStack>
            )}

            {availableChains.length > 1 ? (
            <HStack spacing="0" flexShrink={0}>
              <Text
                px="6px"
                py="2px"
                fontFamily={WIN95_FONT}
                fontSize="10px"
                fontWeight="bold"
                color="#000"
              >
                Chain
              </Text>
            <Box position="relative">
              <Box
                as="button"
                display="flex"
                alignItems="center"
                gap="4px"
                px="6px"
                py="2px"
                fontFamily={WIN95_FONT}
                fontSize={WIN95_FONT_SIZE}
                bg={BUTTON_FACE}
                {...raisedBorder}
                _hover={{ bg: "#d4d4d4" }}
                _active={sunkenBorder}
                onClick={() => setChainDropdownOpen(!chainDropdownOpen)}
              >
                <ChainIcon chainId={chainId} size="12px" />
                <Text fontSize="10px" fontWeight="bold">
                  {CHAIN_NAMES[chainId] || `Chain ${chainId}`}
                </Text>
                <Text fontSize="8px" color="#808080">▼</Text>
              </Box>

              {/* Dropdown */}
              {chainDropdownOpen && (
                <>
                  {/* Backdrop to close dropdown */}
                  <Box
                    position="fixed"
                    inset={0}
                    zIndex={9998}
                    onClick={() => setChainDropdownOpen(false)}
                  />
                  <Box
                    position="absolute"
                    top="100%"
                    right={0}
                    zIndex={9999}
                    bg="white"
                    border={`1px solid ${BUTTON_DARK_SHADOW}`}
                    boxShadow={`2px 2px 0 ${BUTTON_DARK_SHADOW}`}
                    minW="160px"
                    maxH="240px"
                    overflowY="auto"
                  >
                    {availableChains.map((cId) => (
                      <Box
                        key={cId}
                        as="button"
                        display="flex"
                        alignItems="center"
                        gap="6px"
                        w="full"
                        textAlign="left"
                        px="8px"
                        py="3px"
                        fontFamily={WIN95_FONT}
                        fontSize={WIN95_FONT_SIZE}
                        bg={cId === chainId ? "#000080" : "transparent"}
                        color={cId === chainId ? "white" : "black"}
                        _hover={{
                          bg: cId === chainId ? "#000080" : "#000080",
                          color: "white",
                        }}
                        onClick={() => {
                          onChainChange(cId);
                          setChainDropdownOpen(false);
                        }}
                      >
                        <ChainIcon chainId={cId} size="12px" />
                        <Text>
                          {CHAIN_NAMES[cId] || `Chain ${cId}`}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                </>
              )}
            </Box>
            </HStack>
            ) : <Box />}
          </HStack>
        )}

        {/* Window body */}
        <Box
          flex={1}
          m="2px"
          bg="white"
          overflow="hidden"
          borderTop={`1px solid ${BUTTON_SHADOW}`}
          borderLeft={`1px solid ${BUTTON_SHADOW}`}
          borderBottom={`1px solid ${BUTTON_HIGHLIGHT}`}
          borderRight={`1px solid ${BUTTON_HIGHLIGHT}`}
        >
          {children}
        </Box>
      </Box>
    </Rnd>
  );
}
