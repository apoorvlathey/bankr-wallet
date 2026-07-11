import { useEffect, useRef } from "react";

interface PortfolioChartDitherProps {
  areaPath: string;
  color: string;
  height: number;
  isHovered: boolean;
}

const CELL_SIZE = 2;
const VIEWBOX_WIDTH = 100;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((value) => (value + 0.5) / 16));

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Ordered-dither fill for the portfolio sparkline. The canvas intentionally
 * renders at half resolution and is enlarged with nearest-neighbour sampling,
 * giving each Bayer cell a crisp two-pixel footprint without a chart library.
 */
export default function PortfolioChartDither({
  areaPath,
  color,
  height,
  isHovered,
}: PortfolioChartDitherProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intensityRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || !areaPath) return;

    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    let disposed = false;

    const paint = (intensity: number) => {
      const cssWidth = parent.getBoundingClientRect().width;
      const columns = Math.max(8, Math.round(cssWidth / CELL_SIZE));
      const rows = Math.max(8, Math.round(height / CELL_SIZE));

      if (canvas.width !== columns || canvas.height !== rows) {
        canvas.width = columns;
        canvas.height = rows;
      }

      const context = canvas.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, columns, rows);
      const shape = new Path2D(areaPath);
      const scaleX = columns / VIEWBOX_WIDTH;
      const scaleY = rows / height;

      // Find the first cell inside the area for each column. Density is
      // strongest against the value line and dissolves toward the floor, while
      // hover raises both density and ink.
      for (let x = 0; x < columns; x += 1) {
        let top = rows;
        for (let y = 0; y < rows; y += 1) {
          if (
            context.isPointInPath(
              shape,
              (x + 0.5) / scaleX,
              (y + 0.5) / scaleY,
            )
          ) {
            top = y;
            break;
          }
        }

        const depth = rows - top;
        if (depth <= 0) continue;

        for (let y = top; y < rows; y += 1) {
          const density = 1 - (y - top) / depth;
          const threshold = BAYER[y & 3][x & 3] - intensity * 0.12;
          const lit = density > threshold;
          const alpha = clamp(
            (lit ? 0.16 + density * 0.34 : 0.025 + density * 0.055) *
              (1 + intensity * 0.4),
          );

          context.globalAlpha = alpha;
          context.fillStyle = color;
          context.fillRect(x, y, 1, 1);
        }
      }
      context.globalAlpha = 1;
    };

    const settle = () => {
      const target = isHovered ? 1 : 0;
      const current = intensityRef.current;
      const next = prefersReducedMotion
        ? target
        : current + (target - current) * 0.18;
      intensityRef.current = Math.abs(target - next) < 0.01 ? target : next;
      paint(intensityRef.current);

      if (!disposed && intensityRef.current !== target) {
        frame = requestAnimationFrame(settle);
      }
    };

    const observer = new ResizeObserver(() => paint(intensityRef.current));
    observer.observe(parent);
    settle();

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [areaPath, color, height, isHovered]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height,
        imageRendering: "pixelated",
        pointerEvents: "none",
      }}
    />
  );
}
