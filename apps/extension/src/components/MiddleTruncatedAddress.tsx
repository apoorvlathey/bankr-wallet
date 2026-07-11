import { Box, Flex, Text } from "@chakra-ui/react";
import { layoutNextLine, prepareWithSegments } from "@chenglou/pretext";
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

    setFont(nextFont);
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

    const fits = (text: string) => {
      const prepared = prepareWithSegments(text, font);
      const measured = layoutNextLine(
        prepared,
        { segmentIndex: 0, graphemeIndex: 0 },
        Number.MAX_SAFE_INTEGER,
      );
      return (measured?.width ?? 0) <= availableWidth;
    };

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

    let leftVisibleCount = best;
    let rightVisibleCount = best;

    // The symmetric search above grows by two characters at a time. Use any
    // remaining one-character slot so the address ends close to its actions.
    if (
      leftVisibleCount + rightVisibleCount < hex.length &&
      fits(
        `0x${hex.slice(0, leftVisibleCount + 1)}${ELLIPSIS}${hex.slice(
          -rightVisibleCount,
        )}`,
      )
    ) {
      leftVisibleCount += 1;
    } else if (
      leftVisibleCount + rightVisibleCount < hex.length &&
      fits(
        `0x${hex.slice(0, leftVisibleCount)}${ELLIPSIS}${hex.slice(
          -(rightVisibleCount + 1),
        )}`,
      )
    ) {
      rightVisibleCount += 1;
    }

    const leftVisible = hex.slice(0, leftVisibleCount);
    const rightVisible = hex.slice(-rightVisibleCount);
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
  }, [address, availableWidth, font]);

  return (
    <Flex
      ref={containerRef}
      flex={1}
      minW={0}
      fontSize="sm"
      fontFamily="mono"
      color="inherit"
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
        w="full"
        textAlign="start"
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
