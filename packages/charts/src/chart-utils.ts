import type { ChartDatum } from "./types";

export function normalizeX(value: ChartDatum["x"], fallback: number): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function extentOrFallback(values: number[], fallback: [number, number]): [number, number] {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return fallback;
  }

  return [Math.min(...finiteValues), Math.max(...finiteValues)];
}

export function paddedDomain(domain: [number, number]): [number, number] {
  if (domain[0] === domain[1]) {
    const offset = Math.max(Math.abs(domain[0]) * 0.12, 1);
    return [domain[0] - offset, domain[1] + offset];
  }

  const span = domain[1] - domain[0];
  return [domain[0] - span * 0.08, domain[1] + span * 0.08];
}

export function ticksForDomain(domain: [number, number]): number[] {
  const [min, max] = domain;
  const step = (max - min) / 3;
  return [min, min + step, min + step * 2, max];
}

export function ticksFromScale(
  scale: { domain: () => number[]; ticks?: ((count: number) => number[]) | undefined },
  count: number,
): number[] {
  const ticks = scale.ticks?.(count) ?? ticksForDomain(scale.domain() as [number, number]);
  return [...new Set(ticks.filter(Number.isFinite))];
}

export function sampledPointTicks<TPoint extends { xValue: number }>(
  points: TPoint[],
  count: number,
): TPoint[] {
  if (points.length <= count) return points;

  const lastIndex = points.length - 1;
  const selected = new Map<number, TPoint>();
  for (let index = 0; index < count; index += 1) {
    const pointIndex = Math.round((lastIndex * index) / Math.max(count - 1, 1));
    const point = points[pointIndex];
    if (point) selected.set(pointIndex, point);
  }
  return [...selected.entries()].sort((left, right) => left[0] - right[0]).map((entry) => entry[1]);
}

export function nearestPointIndex(points: Array<{ xValue: number }>, value: number): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  points.forEach((point, index) => {
    const distance = Math.abs(point.xValue - value);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

export function formatValue(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

export function formatXValue(value: ChartDatum["x"]): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return formatValue(value);
  return value.length > 12 ? value.slice(0, 12) : value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function truncateLabel(label: string, maxLength: number): string {
  return label.length <= maxLength ? label : `${label.slice(0, Math.max(maxLength - 1, 1))}.`;
}
