export interface ChartPoint {
  x: number;
  y: number;
}

// Use the full monotone tangent so abrupt balance changes ease cleanly into
// their neighbouring segments. Handles remain bounded to each real timestamp
// interval, so the stronger rounding does not shift samples horizontally.
const CURVE_STRENGTH = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function secantSlope(start: ChartPoint, end: ChartPoint): number {
  const width = end.x - start.x;
  return width > 0 ? (end.y - start.y) / width : 0;
}

/**
 * Calculate monotone cubic tangents using the real distance between samples.
 * The weighted harmonic mean is important here: snapshots are not evenly
 * spaced, so treating adjacent points as equally distant can create bulges or
 * loops around a tightly clustered timestamp.
 */
function buildTangents(points: ChartPoint[]): number[] {
  const slopes = points.slice(0, -1).map((point, index) =>
    secantSlope(point, points[index + 1]),
  );

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

/**
 * Build a restrained, monotone curve through timestamp-positioned points.
 * Every Bézier handle stays within its own time segment and value range, so
 * smoothing cannot move a snapshot horizontally or invent a local high/low.
 */
export function buildPortfolioChartPath(points: ChartPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const tangents = buildTangents(points);
  const segments = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const segmentWidth = next.x - current.x;

    if (segmentWidth <= 0) {
      segments.push(`L ${next.x} ${next.y}`);
      continue;
    }

    const handleWidth = segmentWidth / 3;
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    const control1Y = clamp(
      current.y + tangents[index] * handleWidth * CURVE_STRENGTH,
      minY,
      maxY,
    );
    const control2Y = clamp(
      next.y - tangents[index + 1] * handleWidth * CURVE_STRENGTH,
      minY,
      maxY,
    );

    segments.push(
      `C ${current.x + handleWidth} ${control1Y} ` +
        `${next.x - handleWidth} ${control2Y} ${next.x} ${next.y}`,
    );
  }

  return segments.join(" ");
}
