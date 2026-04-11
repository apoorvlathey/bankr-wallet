import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Box, HStack, Text, Skeleton } from "@chakra-ui/react";
import { getSnapshots } from "@/chrome/portfolioSnapshotStorage";
import { useTheme } from "@/theme";

interface PortfolioChartProps {
  address: string;
  hideValue?: boolean;
  refreshTrigger?: number;
}

interface Snapshot {
  timestamp: number;
  totalValueUsd: number;
}

const CHART_HEIGHT = 60;
const CHART_PADDING_TOP = 4;
const CHART_PADDING_BOTTOM = 4;

function formatUsdCompact(val: number): string {
  if (val === 0) return "$0.00";
  if (val < 0.01) return "<$0.01";
  return `$${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Convert a `#rrggbb` (or rgb()) hex string to an rgba() string for SVG fill.
 * The chart series colors come from theme tokens which may use either form, so
 * we tolerate both — falling back to the input string when we can't parse.
 */
function hexToRgba(input: string, alpha: number): string {
  if (input.startsWith("#")) {
    const cleaned = input.slice(1);
    const expanded =
      cleaned.length === 3
        ? cleaned
            .split("")
            .map((c) => c + c)
            .join("")
        : cleaned;
    if (expanded.length === 6) {
      const r = parseInt(expanded.substring(0, 2), 16);
      const g = parseInt(expanded.substring(2, 4), 16);
      const b = parseInt(expanded.substring(4, 6), 16);
      if (![r, g, b].some(Number.isNaN)) {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
  }
  return input;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PortfolioChart({
  address,
  hideValue,
  refreshTrigger = 0,
}: PortfolioChartProps) {
  const { tokens } = useTheme();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

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
    (e: React.MouseEvent<HTMLDivElement>) => {
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
      setHoverIndex(closest);
    },
    [points]
  );

  const handleMouseLeave = useCallback(() => setHoverIndex(null), []);

  if (loading) {
    return (
      <Box px={3} pt={2} pb={1}>
        <Skeleton h="60px" />
      </Box>
    );
  }

  if (snapshots.length < 2) return null;

  const isPositive = change >= 0;
  const lineColor = isPositive
    ? tokens.colors.chart.positive
    : tokens.colors.chart.negative;
  const fillColor = hexToRgba(lineColor, 0.1);
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
    <Box px={3} pt={2} pb={1}>
      {/* Header: change indicator or hover value */}
      <HStack spacing={1.5} mb={1} minH="18px">
        {hoveredSnap ? (
          <>
            <Text fontSize="xs" fontWeight="700" color="text.primary">
              {hideValue ? "$***" : formatUsdCompact(hoveredSnap.totalValueUsd)}
            </Text>
            <Text fontSize="xs" fontWeight="500" color="text.secondary">
              {formatTimestamp(hoveredSnap.timestamp)}
            </Text>
          </>
        ) : (
          <>
            <Text
              fontSize="xs"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wide"
              color="text.secondary"
            >
              {formatTimeRange()}
            </Text>
            <HStack spacing={1}>
              <Text fontSize="xs" fontWeight="700" color={lineColor}>
                {hideValue ? "+$***" : `${isPositive ? "+" : "-"}${formatChange(change)}`}
              </Text>
              <Text fontSize="xs" fontWeight="700" color={lineColor}>
                {hideValue ? "(+**%)" : `(${isPositive ? "+" : ""}${changePercent.toFixed(2)}%)`}
              </Text>
            </HStack>
          </>
        )}
      </HStack>

      {/* SVG chart */}
      <Box
        ref={containerRef}
        position="relative"
        h={`${CHART_HEIGHT}px`}
        border="1px solid"
        borderColor="border.subtle"
        bg="surface.raised"
        cursor="crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
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
          {/* Area fill */}
          <path d={areaPath} fill={fillColor} />
          {/* Line */}
          <path
            d={path}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
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
