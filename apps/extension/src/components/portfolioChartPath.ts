export interface ChartPoint {
  x: number;
  y: number;
}

const CURVE_TENSION = 0.1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Add restrained smoothing while keeping every control point inside its own
 * segment. This matters for snapshots with uneven timestamps: borrowing the
 * neighbouring segment width can otherwise turn a short price move into a
 * large loop or an exaggerated S-curve.
 */
export function buildPortfolioChartPath(points: ChartPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const segments = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const following = points[index + 2] ?? next;
    const segmentWidth = next.x - current.x;

    if (segmentWidth <= 0) {
      segments.push(`L ${next.x} ${next.y}`);
      continue;
    }

    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    const controlOffsetX = segmentWidth * CURVE_TENSION;
    const control1Y = clamp(
      current.y + (next.y - previous.y) * CURVE_TENSION,
      minY,
      maxY,
    );
    const control2Y = clamp(
      next.y - (following.y - current.y) * CURVE_TENSION,
      minY,
      maxY,
    );

    segments.push(
      `C ${current.x + controlOffsetX} ${control1Y} ` +
        `${next.x - controlOffsetX} ${control2Y} ${next.x} ${next.y}`,
    );
  }

  return segments.join(" ");
}
