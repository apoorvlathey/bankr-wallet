"use client";

import { useCallback, useState } from "react";
import { Box, HStack, Text } from "@chakra-ui/react";
import { Settings, X } from "lucide-react";
import { Rnd } from "react-rnd";
import type { WidgetState } from "./types";
import type { WidgetTypeDef } from "./widgetRegistry";
import {
  WIN95_FONT,
  WIN95_FONT_SIZE,
} from "./win95styles";

interface WidgetFrameProps {
  widget: WidgetState;
  widgetDef: WidgetTypeDef;
  isFocused: boolean;
  onFocus: () => void;
  onClose: () => void;
  onDragStop: (position: { x: number; y: number }) => void;
  onResizeStop: (
    size: { w: number; h: number },
    position: { x: number; y: number }
  ) => void;
  onSaveConfig: (config: Record<string, unknown>) => void;
}

export function WidgetFrame({
  widget,
  widgetDef,
  isFocused,
  onFocus,
  onClose,
  onDragStop,
  onResizeStop,
  onSaveConfig,
}: WidgetFrameProps) {
  const [isReconfiguring, setIsReconfiguring] = useState(false);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose();
    },
    [onClose]
  );

  const handleGear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsReconfiguring((prev) => !prev);
    },
    []
  );

  const handleSaveConfig = useCallback(
    (config: Record<string, unknown>) => {
      setIsReconfiguring(false);
      onSaveConfig(config);
    },
    [onSaveConfig]
  );

  const Component = widgetDef.component;
  const showConfig = widget.config === null || isReconfiguring;

  return (
    <Rnd
      position={widget.position}
      size={{ width: widget.size.w, height: widget.size.h }}
      minWidth={widgetDef.minSize.w}
      minHeight={widgetDef.minSize.h}
      style={{
        zIndex: widget.zIndex,
        display: "flex",
      }}
      dragHandleClassName="widget-title-bar"
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
        overflow="hidden"
        borderRadius="8px"
        border="1px solid transparent"
        data-widget-id={widget.id}
        role="group"
        transition="border-color 0.15s"
        _hover={{
          borderColor: "rgba(255,255,255,0.25)",
        }}
      >
        {/* Floating toolbar — visible on hover only */}
        <HStack
          className="widget-title-bar"
          position="absolute"
          top={0}
          left={0}
          right={0}
          h="24px"
          px="6px"
          spacing="6px"
          bg="rgba(10, 16, 30, 0.85)"
          backdropFilter="blur(8px)"
          borderTopRadius="8px"
          cursor="grab"
          userSelect="none"
          zIndex={1}
          opacity={0}
          transition="opacity 0.15s"
          _groupHover={{ opacity: 1 }}
        >
          <Text fontSize="11px" lineHeight="1" flexShrink={0}>
            {widgetDef.icon}
          </Text>
          <Text
            flex={1}
            color="white"
            fontFamily={WIN95_FONT}
            fontSize="10px"
            fontWeight="bold"
            noOfLines={1}
            lineHeight="24px"
            opacity={0.8}
          >
            {widgetDef.name}
          </Text>

          {/* Gear (reconfigure) */}
          {widget.config && (
            <Box
              as="button"
              display="flex"
              alignItems="center"
              justifyContent="center"
              w="16px"
              h="16px"
              borderRadius="4px"
              flexShrink={0}
              opacity={isReconfiguring ? 1 : 0.6}
              _hover={{ opacity: 1, bg: "rgba(255,255,255,0.1)" }}
              onClick={handleGear}
            >
              <Settings size={10} color="white" />
            </Box>
          )}

          {/* Close */}
          <Box
            as="button"
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="16px"
            h="16px"
            borderRadius="4px"
            flexShrink={0}
            opacity={0.6}
            _hover={{ opacity: 1, bg: "rgba(255,80,80,0.3)" }}
            onClick={handleClose}
          >
            <X size={10} color="white" />
          </Box>
        </HStack>

        {/* Widget body — fills entire frame */}
        <Box
          flex={1}
          overflow="hidden"
          borderRadius="8px"
          bg={showConfig ? "rgba(10, 16, 30, 0.92)" : "transparent"}
        >
          {/* @ts-ignore — React 18/19 types conflict */}
          <Component
            config={showConfig ? null : widget.config}
            onSaveConfig={handleSaveConfig}
          />
        </Box>
      </Box>
    </Rnd>
  );
}
