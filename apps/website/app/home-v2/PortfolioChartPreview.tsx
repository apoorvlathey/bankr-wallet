"use client";

import { useEffect, useRef } from "react";
import { Box } from "@chakra-ui/react";
import { warmMockup as ui } from "./design";

type ChartPoint = {
  x: number;
  y: number;
};

const HEIGHT = 68;
const PADDING_TOP = 5;
const PADDING_BOTTOM = 4;
const CELL_SIZE = 2;
const VALUES = [
  42, 44, 47, 45, 43, 49, 54, 52, 58, 61, 59, 55,
  50, 47, 51, 56, 62, 66, 63, 68, 72, 70, 76, 82,
];
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => (value + 0.5) / 16));

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildTangents(points: ChartPoint[]) {
  const slopes = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return (next.y - point.y) / (next.x - point.x);
  });

  return points.map((point, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes[slopes.length - 1];

    const previousSlope = slopes[index - 1];
    const nextSlope = slopes[index];
    if (
      previousSlope === 0 ||
      nextSlope === 0 ||
      Math.sign(previousSlope) !== Math.sign(nextSlope)
    ) {
      return 0;
    }

    const previousWidth = point.x - points[index - 1].x;
    const nextWidth = points[index + 1].x - point.x;
    const previousWeight = 2 * nextWidth + previousWidth;
    const nextWeight = nextWidth + 2 * previousWidth;

    return (
      (previousWeight + nextWeight) /
      (previousWeight / previousSlope + nextWeight / nextSlope)
    );
  });
}

function buildChartPath(points: ChartPoint[]) {
  const tangents = buildTangents(points);
  const segments = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const width = next.x - current.x;
    const handleWidth = width / 3;
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    const control1Y = clamp(current.y + tangents[index] * handleWidth, minY, maxY);
    const control2Y = clamp(next.y - tangents[index + 1] * handleWidth, minY, maxY);

    segments.push(
      `C ${current.x + handleWidth} ${control1Y} ` +
        `${next.x - handleWidth} ${control2Y} ${next.x} ${next.y}`,
    );
  }

  return segments.join(" ");
}

const minValue = Math.min(...VALUES);
const maxValue = Math.max(...VALUES);
const range = maxValue - minValue;
const drawHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const points = VALUES.map((value, index) => ({
  x: (index / (VALUES.length - 1)) * 100,
  y: PADDING_TOP + drawHeight - ((value - minValue) / range) * drawHeight,
}));
const linePath = buildChartPath(points);
const areaPath = `${linePath} L 100 ${HEIGHT} L 0 ${HEIGHT} Z`;

export function PortfolioChartPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const paint = () => {
      const columns = Math.max(8, Math.round(parent.getBoundingClientRect().width / CELL_SIZE));
      const rows = Math.max(8, Math.round(HEIGHT / CELL_SIZE));
      canvas.width = columns;
      canvas.height = rows;

      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, columns, rows);

      const shape = new Path2D(areaPath);
      const scaleX = columns / 100;
      const scaleY = rows / HEIGHT;

      for (let x = 0; x < columns; x += 1) {
        let top = rows;
        for (let y = 0; y < rows; y += 1) {
          if (context.isPointInPath(shape, (x + 0.5) / scaleX, (y + 0.5) / scaleY)) {
            top = y;
            break;
          }
        }

        const depth = rows - top;
        if (depth <= 0) continue;

        for (let y = top; y < rows; y += 1) {
          const density = 1 - (y - top) / depth;
          const lit = density > BAYER[y & 3][x & 3];
          context.globalAlpha = lit
            ? 0.16 + density * 0.34
            : 0.025 + density * 0.055;
          context.fillStyle = ui.green;
          context.fillRect(x, y, 1, 1);
        }
      }
      context.globalAlpha = 1;
    };

    const observer = new ResizeObserver(paint);
    observer.observe(parent);
    paint();
    return () => observer.disconnect();
  }, []);

  return (
    <Box position="relative" h={`${HEIGHT}px`} borderRadius="8px" overflow="hidden" bg={ui.sunken}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: HEIGHT,
          imageRendering: "pixelated",
          pointerEvents: "none",
        }}
      />
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ display: "block", position: "relative" }}
      >
        {[25, 50, 75].map((x) => (
          <line
            key={x}
            x1={x}
            y1={HEIGHT - 4}
            x2={x}
            y2={HEIGHT}
            stroke={ui.muted}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={linePath}
          fill="none"
          stroke={ui.green}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </Box>
  );
}
