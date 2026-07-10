import { useState, type ReactNode } from "react";
import { Pie } from "@visx/shape";

import {
  categoryOpacity,
  categoryShare,
  categoryTooltipContext,
  categoryTotal,
  defaultCategoryTooltipRows,
  donutTooltipPoint,
  fitTextFontSize,
  tooltipCoordinates,
  type CategoryShareBasis,
} from "./category-chart-utils";
import { CategoryChartCaption, CategoryLegend, ChartTooltip } from "./chart-interaction";
import { ChartFrame } from "./chart-state";
import { clamp, formatPercent, formatValue as defaultFormatValue } from "./chart-utils";
import { chartTheme, chartToneForIndex, toneColor } from "./theme";
import type {
  CategoryChartLegendMode,
  CategoryDatum,
  CategoryTooltipContext,
  CategoryTooltipRow,
  ChartState,
} from "./types";
import { useChartWidth } from "./use-chart-width";

export type DonutChartProps = {
  caption?: ReactNode | undefined;
  data: CategoryDatum[];
  formatValue?: ((value: number) => string) | undefined;
  formatShare?: ((share: number) => string) | undefined;
  totalLabel?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  label?: string | undefined;
  legend?: CategoryChartLegendMode | undefined;
  shareLabel?: string | undefined;
  state?: ChartState | undefined;
  tooltipRows?:
    | ((datum: CategoryDatum, context: CategoryTooltipContext) => CategoryTooltipRow[])
    | undefined;
  tooltipTitle?: ((datum: CategoryDatum, context: CategoryTooltipContext) => ReactNode) | undefined;
  valueLabel?: string | undefined;
};

export function DonutChart({
  caption,
  data,
  formatValue = defaultFormatValue,
  formatShare = formatPercent,
  height = 220,
  label = "Donut chart",
  legend = "none",
  shareLabel = "Share",
  state,
  tooltipRows,
  tooltipTitle,
  totalLabel = "Total",
  valueLabel = "Value",
  width = 320,
}: DonutChartProps) {
  const chart = useChartWidth(width);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const nextState = state ?? (data.length === 0 ? "empty" : "ready");
  if (nextState !== "ready") {
    return <ChartFrame height={height} state={nextState} title={label} />;
  }

  const shareBasis: CategoryShareBasis = "positive";
  const total = categoryTotal(data, shareBasis);
  if (total === 0) {
    return <ChartFrame height={height} state="empty" title={label} />;
  }

  const chartWidth = chart.width;
  const centerX = chartWidth / 2;
  const centerY = height / 2;
  const radius = Math.min(chartWidth, height) * 0.31;
  const strokeWidth = clamp(radius * 0.2, 10, 16);
  const innerRadius = Math.max(radius - strokeWidth / 2, 1);
  const outerRadius = radius + strokeWidth / 2;
  const segments = data.map((datum, index) => ({
    ...datum,
    tone: datum.tone ?? chartToneForIndex(index),
  }));
  const activeDatum = activeIndex === null ? null : (segments[activeIndex] ?? null);
  const activeContext =
    activeDatum && activeIndex !== null
      ? categoryTooltipContext(activeDatum, activeIndex, total, shareBasis)
      : null;
  const activeTooltipRows =
    activeDatum && activeContext
      ? (tooltipRows?.(activeDatum, activeContext) ??
        defaultCategoryTooltipRows(
          activeDatum,
          activeContext,
          formatValue,
          formatShare,
          valueLabel,
          shareLabel,
        ))
      : [];
  const activeTitle =
    activeDatum && activeContext
      ? (tooltipTitle?.(activeDatum, activeContext) ?? activeDatum.label)
      : null;
  const totalText = formatValue(total);
  const centerFontSize = fitTextFontSize(totalText, innerRadius * 1.42, 18, 10);
  const centerLabelFontSize = fitTextFontSize(totalLabel, innerRadius * 1.5, 11, 8);
  const activeTooltipPoint =
    activeIndex === null
      ? null
      : donutTooltipPoint(segments, total, activeIndex, centerX, centerY, radius);
  const activeTooltipPosition = activeTooltipPoint
    ? tooltipCoordinates({
        chartWidth,
        height,
        x: activeTooltipPoint.x,
        y: activeTooltipPoint.y,
      })
    : null;

  return (
    <ChartFrame height={height}>
      <div className="qitu-category-chart">
        <CategoryChartCaption>{caption}</CategoryChartCaption>
        <div
          ref={chart.ref}
          className="qitu-chart-root"
          onPointerLeave={() => setActiveIndex(null)}
        >
          <svg
            aria-label={label}
            className="qitu-chart"
            height={height}
            role="group"
            viewBox={`0 0 ${chartWidth} ${height}`}
            width="100%"
          >
            <title>{label}</title>
            <circle
              cx={centerX}
              cy={centerY}
              fill="none"
              r={radius}
              stroke={chartTheme.grid}
              strokeWidth={strokeWidth}
            />
            <Pie
              cornerRadius={Math.min(strokeWidth / 2, 10)}
              data={segments}
              endAngle={Math.PI * 1.5}
              innerRadius={innerRadius}
              left={centerX}
              outerRadius={outerRadius}
              padAngle={0.02}
              pieSort={null}
              pieSortValues={null}
              pieValue={(datum) => Math.max(datum.value, 0)}
              startAngle={-Math.PI / 2}
              top={centerY}
            >
              {({ arcs, path }) => (
                <g role="list" transform={`translate(${centerX}, ${centerY})`}>
                  {arcs.map((arc, index) => (
                    <path
                      aria-label={`${arc.data.label}: ${valueLabel} ${formatValue(arc.data.value)}, ${shareLabel} ${formatShare(categoryShare(arc.data.value, total, shareBasis))}`}
                      d={path(arc) ?? undefined}
                      fill={toneColor(arc.data.tone ?? "info")}
                      key={`${arc.data.label}:${index}`}
                      opacity={categoryOpacity(index, activeIndex)}
                      role="listitem"
                      stroke={activeIndex === index ? chartTheme.surface : undefined}
                      strokeWidth={activeIndex === index ? 2 : undefined}
                      tabIndex={0}
                      onBlur={() => setActiveIndex(null)}
                      onFocus={() => setActiveIndex(index)}
                      onPointerEnter={() => setActiveIndex(index)}
                    >
                      <title>{`${arc.data.label}: ${formatValue(arc.data.value)}`}</title>
                    </path>
                  ))}
                </g>
              )}
            </Pie>
            <text
              className="qitu-number"
              dominantBaseline="middle"
              fill="var(--qitu-text)"
              fontSize={centerFontSize}
              fontWeight="600"
              textAnchor="middle"
              x={centerX}
              y={centerY - 7}
            >
              {totalText}
            </text>
            <text
              dominantBaseline="middle"
              fill={chartTheme.text}
              fontSize={centerLabelFontSize}
              textAnchor="middle"
              x={centerX}
              y={centerY + 15}
            >
              {totalLabel}
            </text>
          </svg>
          {activeDatum &&
          activeTitle !== null &&
          activeTitle !== undefined &&
          activeTooltipPosition ? (
            <ChartTooltip
              left={activeTooltipPosition.left}
              rows={activeTooltipRows}
              title={activeTitle}
              top={activeTooltipPosition.top}
              width={activeTooltipPosition.width}
            />
          ) : null}
        </div>
        {legend === "inline" ? (
          <CategoryLegend
            activeIndex={activeIndex}
            data={segments}
            formatShare={formatShare}
            formatValue={formatValue}
            shareBasis={shareBasis}
            shareLabel={shareLabel}
            total={total}
            valueLabel={valueLabel}
            onActiveIndexChange={setActiveIndex}
          />
        ) : null}
      </div>
    </ChartFrame>
  );
}
