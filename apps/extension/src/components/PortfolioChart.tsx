import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Box, HStack, Text, Skeleton } from "@chakra-ui/react";
import { getSnapshots } from "@/chrome/portfolioSnapshotStorage";
import { isDarkThemeId, useTheme } from "@/theme";
import { formatAbsoluteTimestamp } from "@/lib/timeFormatUtils";
import PortfolioChartDither from "@/components/PortfolioChartDither";
import { buildPortfolioChartPath } from "@/components/portfolioChartPath";
import { playInteractionSound } from "@/sounds/soundManager";

interface PortfolioChartProps {
  address: string;
  hideValue?: boolean;
  refreshTrigger?: number;
  onHoverValueChange?: (value: number | null) => void;
}

interface Snapshot {
  timestamp: number;
  totalValueUsd: number;
}

const CHART_HEIGHT = 60;
const CHART_PADDING_TOP = 4;
const CHART_PADDING_BOTTOM = 4;

const formatTimestamp = (ts: number): string => formatAbsoluteTimestamp(ts);

export default function PortfolioChart({
  address,
  hideValue,
  refreshTrigger = 0,
  onHoverValueChange,
}: PortfolioChartProps) {
  const { themeId, tokens } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverIndexRef = useRef<number | null>(null);
  const isPointerDraggingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSnapshots(address).then((data) => {
      if (!cancelled) {
        setSnapshots(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [address, refreshTrigger]);

  const { path, areaPath, change, changePercent, points, dayTicks } = useMemo(() => {
    if (snapshots.length < 2)
      return { path: "", areaPath: "", change: 0, changePercent: 0, points: [], dayTicks: [] };

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const change = last.totalValueUsd - first.totalValueUsd;
    const changePercent =
      first.totalValueUsd > 0 ? (change / first.totalValueUsd) * 100 : 0;

    const values = snapshots.map((s) => s.totalValueUsd);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const drawHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

    const timeMin = snapshots[0].timestamp;
    const timeMax = snapshots[snapshots.length - 1].timestamp;
    const timeRange = timeMax - timeMin || 1;

    const points = snapshots.map((s) => {
      const x = ((s.timestamp - timeMin) / timeRange) * 100;
      const y =
        CHART_PADDING_TOP +
        drawHeight -
        ((s.totalValueUsd - minVal) / range) * drawHeight;
      return { x, y };
    });

    const path = buildPortfolioChartPath(points);

    const areaPath =
      path +
      ` L ${points[points.length - 1].x} ${CHART_HEIGHT} L ${points[0].x} ${CHART_HEIGHT} Z`;

    // Day tick marks: find midnight boundaries within the time range
    const dayTicks: number[] = [];
    const firstMidnight = new Date(timeMin);
    firstMidnight.setHours(0, 0, 0, 0);
    // Start from the next midnight after timeMin
    let tick = firstMidnight.getTime() + 24 * 60 * 60 * 1000;
    while (tick < timeMax) {
      const xPct = ((tick - timeMin) / timeRange) * 100;
      if (xPct > 2 && xPct < 98) dayTicks.push(xPct);
      tick += 24 * 60 * 60 * 1000;
    }

    return { path, areaPath, change, changePercent, points, dayTicks };
  }, [snapshots]);

  const handleMouseMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!containerRef.current || points.length === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
      // Find the closest point by x position
      let closest = 0;
      let minDist = Math.abs(points[0].x - xPercent);
      for (let i = 1; i < points.length; i++) {
        const dist = Math.abs(points[i].x - xPercent);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      const previousIndex = hoverIndexRef.current;
      if (closest === previousIndex) return;
      hoverIndexRef.current = closest;
      setHoverIndex(closest);
      onHoverValueChange?.(snapshots[closest].totalValueUsd);
      const displayedValueChanged =
        previousIndex === null ||
        snapshots[previousIndex]?.totalValueUsd !==
          snapshots[closest]?.totalValueUsd;
      if (!hideValue && displayedValueChanged && !isPointerDraggingRef.current) {
        void playInteractionSound("chartValueChange");
      }
    },
    [hideValue, onHoverValueChange, points, snapshots]
  );

  const handleMouseLeave = useCallback(() => {
    hoverIndexRef.current = null;
    isPointerDraggingRef.current = false;
    setHoverIndex(null);
    onHoverValueChange?.(null);
  }, [onHoverValueChange]);

  useEffect(
    () => () => {
      onHoverValueChange?.(null);
    },
    [address, onHoverValueChange],
  );

  if (loading) {
    return (
      <Box pt={2} pb={1}>
        <Skeleton h="60px" />
      </Box>
    );
  }

  if (snapshots.length < 2) return null;

  const isPositive = change >= 0;
  const lineColor = isPositive
    ? tokens.colors.chart.positive
    : tokens.colors.chart.negative;
  const crosshairColor = tokens.colors.border.default;
  const dotBorderColor = tokens.colors.border.default;

  const formatChange = (val: number): string => {
    const abs = Math.abs(val);
    if (abs < 0.01) return "$0.00";
    return `$${abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatTimeRange = (): string => {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const diffMs = last.timestamp - first.timestamp;
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 24) return `${Math.round(diffHours)}h`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d`;
  };

  // Hover state: show hovered point's value + time, otherwise show overall change
  const hoveredSnap = hoverIndex !== null ? snapshots[hoverIndex] : null;
  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <Box pt={0} pb={1}>
      {/* One stable row: portfolio change normally, tracked timestamp on hover. */}
      <HStack
        position="relative"
        spacing={1.5}
        mb={1}
        h="24px"
        px={3}
        overflow="hidden"
        whiteSpace="nowrap"
      >
        {!hoveredSnap && (
          <>
            <Text
              fontSize="xs"
              lineHeight="18px"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wide"
              color="text.secondary"
            >
              {formatTimeRange()}
            </Text>
            <HStack spacing={1} h="18px">
              <Text fontSize="xs" lineHeight="18px" fontWeight="700" color={lineColor}>
                {hideValue ? "+$***" : `${isPositive ? "+" : "-"}${formatChange(change)}`}
              </Text>
              <Text fontSize="xs" lineHeight="18px" fontWeight="700" color={lineColor}>
                {hideValue ? "(+**%)" : `(${isPositive ? "+" : ""}${changePercent.toFixed(2)}%)`}
              </Text>
            </HStack>
          </>
        )}
        {hoveredSnap && hoveredPoint && (
          <Text
            position="absolute"
            top={0}
            left={`${hoveredPoint.x}%`}
            maxW="calc(100% - 16px)"
            px={2}
            py={1}
            borderRadius="md"
            bg="surface.raised"
            borderWidth="1px"
            borderColor="border.subtle"
            color="fg.secondary"
            fontSize="10px"
            lineHeight="14px"
            fontWeight="600"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
            sx={{ fontVariantNumeric: "tabular-nums" }}
            transform={
              hoveredPoint.x < 24
                ? "translateX(4px)"
                : hoveredPoint.x > 76
                  ? "translateX(calc(-100% - 4px))"
                  : "translateX(-50%)"
            }
            pointerEvents="none"
          >
            {formatTimestamp(hoveredSnap.timestamp)}
          </Text>
        )}
      </HStack>

      {/* SVG chart */}
      <Box
        ref={containerRef}
        position="relative"
        h={`${CHART_HEIGHT}px`}
        borderRadius={isDarkTheme ? "md" : undefined}
        overflow="hidden"
        bg={isDarkTheme ? "surface.sunken" : "transparent"}
        cursor="crosshair"
        onPointerDown={() => {
          isPointerDraggingRef.current = true;
        }}
        onPointerUp={() => {
          isPointerDraggingRef.current = false;
        }}
        onPointerCancel={() => {
          isPointerDraggingRef.current = false;
        }}
        onPointerMove={handleMouseMove}
        onPointerLeave={handleMouseLeave}
      >
        <PortfolioChartDither
          areaPath={areaPath}
          color={lineColor}
          height={CHART_HEIGHT}
          isHovered={hoverIndex !== null}
        />
        <svg
          width="100%"
          height={CHART_HEIGHT}
          viewBox={`0 0 100 ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          {/* Day tick marks */}
          {dayTicks.map((xPct, i) => (
            <line
              key={i}
              x1={xPct}
              y1={CHART_HEIGHT - 4}
              x2={xPct}
              y2={CHART_HEIGHT}
              stroke={tokens.colors.fg.muted}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* Line */}
          <path
            d={path}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Hover crosshair + dot — rendered outside SVG to avoid stretching */}
        {hoveredPoint && (
          <>
            <Box
              position="absolute"
              top={0}
              left={`${hoveredPoint.x}%`}
              h="100%"
              w="1px"
              borderLeft={`1px dashed ${crosshairColor}`}
              pointerEvents="none"
            />
            <Box
              position="absolute"
              top={`${hoveredPoint.y}px`}
              left={`${hoveredPoint.x}%`}
              w="7px"
              h="7px"
              borderRadius="full"
              bg={lineColor}
              border={`1px solid ${dotBorderColor}`}
              transform="translate(-50%, -50%)"
              pointerEvents="none"
            />
          </>
        )}
      </Box>
    </Box>
  );
}
