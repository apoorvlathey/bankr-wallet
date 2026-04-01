import { Box, Flex, Text } from "@chakra-ui/react";
import { layout, prepare } from "@chenglou/pretext";
import { useEffect, useRef, useState } from "react";

const MIN_VISIBLE_HEX_CHARS_PER_SIDE = 2;
const EMPHASIZED_HEX_CHARS_PER_SIDE = 4;
const ELLIPSIS = "...";

type TruncationState =
  | { kind: "full"; text: string }
  | {
      kind: "truncated";
      leftEmphasis: string;
      leftMuted: string;
      rightMuted: string;
      rightEmphasis: string;
    };

export default function MiddleTruncatedAddress({
  address,
}: {
  address: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [font, setFont] = useState("");
  const [lineHeight, setLineHeight] = useState(16);
  const [display, setDisplay] = useState<TruncationState>({
    kind: "full",
    text: address,
  });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const measure = () => {
      setAvailableWidth(node.clientWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = textRef.current;
    if (!node) return;

    const computed = window.getComputedStyle(node);
    const nextFont = [
      computed.fontStyle,
      computed.fontVariant,
      computed.fontWeight,
      computed.fontSize,
      computed.fontFamily,
    ]
      .filter(Boolean)
      .join(" ");

    const fontSize = Number.parseFloat(computed.fontSize) || 16;
    const nextLineHeight = computed.lineHeight.endsWith("px")
      ? Number.parseFloat(computed.lineHeight)
      : fontSize * 1.2;

    setFont(nextFont);
    setLineHeight(nextLineHeight);
  }, []);

  useEffect(() => {
    if (!address) {
      setDisplay({ kind: "full", text: "" });
      return;
    }

    if (!font || availableWidth <= 0) {
      setDisplay({ kind: "full", text: address });
      return;
    }

    const normalized = address.startsWith("0x") ? address : `0x${address}`;
    const hex = normalized.slice(2);

    if (!hex) {
      setDisplay({ kind: "full", text: normalized });
      return;
    }

    const fits = (text: string) =>
      layout(prepare(text, font), availableWidth, lineHeight).lineCount === 1;

    if (fits(normalized)) {
      setDisplay({ kind: "full", text: normalized });
      return;
    }

    let low = MIN_VISIBLE_HEX_CHARS_PER_SIDE;
    let high = Math.floor(hex.length / 2);
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `0x${hex.slice(0, mid)}${ELLIPSIS}${hex.slice(-mid)}`;

      if (fits(candidate)) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (best === 0) {
      setDisplay({
        kind: "truncated",
        leftEmphasis: `0x${hex.slice(0, 1)}`,
        leftMuted: "",
        rightMuted: "",
        rightEmphasis: hex.slice(-1),
      });
      return;
    }

    const leftVisible = hex.slice(0, best);
    const rightVisible = hex.slice(-best);
    const leftEmphasisCount = Math.min(
      EMPHASIZED_HEX_CHARS_PER_SIDE,
      leftVisible.length,
    );
    const rightEmphasisCount = Math.min(
      EMPHASIZED_HEX_CHARS_PER_SIDE,
      rightVisible.length,
    );

    setDisplay({
      kind: "truncated",
      leftEmphasis: `0x${leftVisible.slice(0, leftEmphasisCount)}`,
      leftMuted: leftVisible.slice(leftEmphasisCount),
      rightMuted: rightVisible.slice(0, rightVisible.length - rightEmphasisCount),
      rightEmphasis: rightVisible.slice(-rightEmphasisCount),
    });
  }, [address, availableWidth, font, lineHeight]);

  return (
    <Flex
      ref={containerRef}
      flex={1}
      minW={0}
      fontSize="sm"
      fontFamily="mono"
      color="bauhaus.white"
      align="center"
    >
      <Text
        ref={textRef}
        as="span"
        fontSize="inherit"
        fontFamily="inherit"
        color="inherit"
        whiteSpace="nowrap"
        overflow="hidden"
        display="block"
      >
        {display.kind === "full" ? (
          display.text
        ) : (
          <>
            <Box as="span" fontWeight="400">
              {display.leftEmphasis}
            </Box>
            {display.leftMuted ? (
              <Box as="span" fontWeight="300" opacity={0.5}>
                {display.leftMuted}
              </Box>
            ) : null}
            <Box as="span" fontWeight="400" opacity={0.5}>
              {ELLIPSIS}
            </Box>
            {display.rightMuted ? (
              <Box as="span" fontWeight="300" opacity={0.5}>
                {display.rightMuted}
              </Box>
            ) : null}
            <Box as="span" fontWeight="400">
              {display.rightEmphasis}
            </Box>
          </>
        )}
      </Text>
    </Flex>
  );
}
