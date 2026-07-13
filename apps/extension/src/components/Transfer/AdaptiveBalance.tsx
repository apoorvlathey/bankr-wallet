import { Box, HStack, Text, Tooltip } from "@chakra-ui/react";
import { useLayoutEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { formatCompact, formatWithCommas } from "@/lib/convertUtils";

interface AdaptiveBalanceProps {
  balanceStr: string;
  balanceFormatted: string;
  priceUsd: number | null;
}

/** A full-width balance that compacts only when its exact value cannot fit. */
export function AdaptiveBalance({
  balanceStr,
  balanceFormatted,
  priceUsd,
}: AdaptiveBalanceProps) {
  const balanceNum = parseFloat(balanceStr);
  const fullBalance = !isNaN(balanceNum)
    ? formatWithCommas(balanceNum.toString())
    : balanceFormatted;
  const compactBalance = !isNaN(balanceNum)
    ? formatCompact(balanceStr)
    : balanceFormatted;
  const usdLabel =
    priceUsd !== null && !isNaN(balanceNum)
      ? formatUsd(balanceNum * priceUsd)
      : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLParagraphElement>(null);
  const [showCompact, setShowCompact] = useState(false);

  useLayoutEffect(() => {
    const check = () => {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (!container || !measure) return;
      setShowCompact(measure.scrollWidth > container.clientWidth + 0.5);
    };
    check();
    const observer = new ResizeObserver(check);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fullBalance]);

  const displayedBalance = showCompact ? `~${compactBalance}` : fullBalance;

  return (
    <HStack spacing={2} align="center" w="full" minW={0}>
      <Text
        fontSize="2xs"
        fontWeight="500"
        color="fg.secondary"
        lineHeight="1"
        flexShrink={0}
      >
        Balance
      </Text>
      <Box
        ref={containerRef}
        ml="auto"
        position="relative"
        overflow="hidden"
        textAlign="right"
        flex="1 1 0"
        minW={0}
      >
        <Text
          ref={measureRef}
          position="absolute"
          top={0}
          right={0}
          visibility="hidden"
          pointerEvents="none"
          whiteSpace="nowrap"
          fontSize="sm"
          fontWeight="800"
          aria-hidden="true"
        >
          {fullBalance}
        </Text>
        <Tooltip
          label={fullBalance}
          placement="top"
          hasArrow
          openDelay={200}
          isDisabled={!showCompact}
        >
          <Text
            fontSize="sm"
            fontWeight="600"
            color="fg.primary"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {displayedBalance}
          </Text>
        </Tooltip>
      </Box>
      {usdLabel && (
        <Text
          fontSize="xs"
          fontWeight="500"
          color="fg.secondary"
          lineHeight="1"
          flexShrink={0}
        >
          {usdLabel}
        </Text>
      )}
    </HStack>
  );
}
