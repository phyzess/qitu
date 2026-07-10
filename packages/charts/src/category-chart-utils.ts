import type { CategoryDatum, CategoryTooltipContext, CategoryTooltipRow, ChartTone } from "./types";
import { clamp } from "./chart-utils";

export type CategoryShareBasis = "absolute" | "positive";

export function categoryTooltipContext(
  datum: CategoryDatum,
  index: number,
  total: number,
  shareBasis: CategoryShareBasis,
): CategoryTooltipContext {
  return {
    datum,
    index,
    share: categoryShare(datum.value, total, shareBasis),
    total,
  };
}

export function defaultCategoryTooltipRows(
  datum: CategoryDatum,
  context: CategoryTooltipContext,
  formatValue: (value: number) => string,
  formatShare: (share: number) => string,
  valueLabel: string,
  shareLabel: string,
): CategoryTooltipRow[] {
  return [
    { label: valueLabel, value: formatValue(datum.value), tone: datum.tone },
    { label: shareLabel, value: formatShare(context.share) },
  ];
}

export function categoryTotal(data: CategoryDatum[], shareBasis: CategoryShareBasis): number {
  return data.reduce((sum, datum) => sum + categoryBasisValue(datum.value, shareBasis), 0);
}

export function categoryShare(
  value: number,
  total: number,
  shareBasis: CategoryShareBasis,
): number {
  if (total <= 0 || !Number.isFinite(total)) return 0;
  return categoryBasisValue(value, shareBasis) / total;
}

function categoryBasisValue(value: number, shareBasis: CategoryShareBasis): number {
  if (!Number.isFinite(value)) return 0;
  return shareBasis === "positive" ? Math.max(value, 0) : Math.abs(value);
}

export function categoryOpacity(index: number, activeIndex: number | null): number {
  if (activeIndex === null || activeIndex === index) return 1;
  return 0.38;
}

export function donutTooltipPoint(
  data: CategoryDatum[],
  total: number,
  activeIndex: number,
  centerX: number,
  centerY: number,
  radius: number,
): { x: number; y: number } {
  if (total <= 0) return { x: centerX, y: centerY };

  let startAngle = -Math.PI / 2;
  for (let index = 0; index < data.length; index += 1) {
    const value = Math.max(data[index]?.value ?? 0, 0);
    const sweep = (value / total) * Math.PI * 2;
    if (index === activeIndex) {
      const angle = startAngle + sweep / 2;
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    }
    startAngle += sweep;
  }

  return { x: centerX, y: centerY };
}

export function tooltipCoordinates(input: {
  chartWidth: number;
  height: number;
  x: number;
  y: number;
}): { left: number; top: number; width: number } {
  const width = Math.min(224, Math.max(176, input.chartWidth - 16));
  const maxLeft = Math.max(8, input.chartWidth - width - 8);
  const rightCandidate = input.x + 14;
  const leftCandidate = input.x - width - 14;
  const preferredLeft =
    rightCandidate + width <= input.chartWidth - 8 ? rightCandidate : leftCandidate;
  return {
    left: clamp(preferredLeft, 8, maxLeft),
    top: clamp(input.y - 56, 8, Math.max(8, input.height - 112)),
    width,
  };
}

export function barTone(value: number): ChartTone {
  if (value < 0) return "negative";
  if (value === 0) return "neutral";
  return "info";
}

export function fitTextFontSize(
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): number {
  const estimatedWidthUnits = Array.from(text).reduce((sum, character) => {
    return sum + (character.charCodeAt(0) > 255 ? 1 : 0.58);
  }, 0);
  return clamp(maxWidth / Math.max(estimatedWidthUnits, 1), minSize, maxSize);
}
