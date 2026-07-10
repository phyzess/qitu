import { useState, type ReactNode } from "react";
import { scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";

import {
  barTone,
  categoryOpacity,
  categoryShare,
  categoryTooltipContext,
  categoryTotal,
  defaultCategoryTooltipRows,
  tooltipCoordinates,
  type CategoryShareBasis,
} from "./category-chart-utils";
import { CategoryChartCaption, CategoryLegend, ChartTooltip } from "./chart-interaction";
import { ChartGrid } from "./chart-grid";
import { ChartFrame } from "./chart-state";
import {
  clamp,
  formatPercent,
  formatValue as defaultFormatValue,
  ticksFromScale,
  truncateLabel,
} from "./chart-utils";
import { chartTheme, toneColor } from "./theme";
import type {
  CategoryChartLegendMode,
  CategoryDatum,
  CategoryTooltipContext,
  CategoryTooltipRow,
  ChartState,
} from "./types";
import { useChartWidth } from "./use-chart-width";

export type BarChartProps = {
  caption?: ReactNode | undefined;
  data: CategoryDatum[];
  formatValue?: ((value: number) => string) | undefined;
  formatShare?: ((share: number) => string) | undefined;
  width?: number | undefined;
  height?: number | undefined;
  label?: string | undefined;
  layout?: "horizontal" | "vertical" | undefined;
  legend?: CategoryChartLegendMode | undefined;
  shareLabel?: string | undefined;
  state?: ChartState | undefined;
  tooltipRows?:
    | ((datum: CategoryDatum, context: CategoryTooltipContext) => CategoryTooltipRow[])
    | undefined;
  tooltipTitle?: ((datum: CategoryDatum, context: CategoryTooltipContext) => ReactNode) | undefined;
  valueLabel?: string | undefined;
};

export function BarChart({
  caption,
  data,
  formatValue = defaultFormatValue,
  formatShare = formatPercent,
  height = 220,
  label = "Bar chart",
  layout = "vertical",
  legend = "none",
  shareLabel = "Share",
  state,
  tooltipRows,
  tooltipTitle,
  valueLabel = "Value",
  width = 560,
}: BarChartProps) {
  const chart = useChartWidth(width);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const nextState = state ?? (data.length === 0 ? "empty" : "ready");
  if (nextState !== "ready") {
    return <ChartFrame height={height} state={nextState} title={label} />;
  }

  const chartWidth = chart.width;
  const normalizedData = data.map((datum) => ({
    ...datum,
    tone: datum.tone ?? barTone(datum.value),
  }));
  const shareBasis: CategoryShareBasis = "absolute";
  const total = categoryTotal(normalizedData, shareBasis);
  const activeDatum = activeIndex === null ? null : (normalizedData[activeIndex] ?? null);
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

  if (layout === "horizontal") {
    const padding = { top: 18, right: 22, bottom: 34, left: clamp(chartWidth * 0.34, 92, 180) };
    const innerWidth = Math.max(chartWidth - padding.left - padding.right, 1);
    const innerHeight = Math.max(height - padding.top - padding.bottom, 1);
    const values = normalizedData.map((datum) => datum.value).filter(Number.isFinite);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const domain: [number, number] =
      min === max ? [min - Math.max(Math.abs(min) * 0.12, 1), max + 1] : [min, max];
    const xScale = scaleLinear({
      domain,
      nice: true,
      range: [padding.left, padding.left + innerWidth],
    });
    const xDomain = xScale.domain() as [number, number];
    const xTicks = ticksFromScale(xScale, innerWidth >= 220 ? 4 : 3);
    const zeroX = xScale(clamp(0, xDomain[0], xDomain[1]));
    const rowHeight = innerHeight / normalizedData.length;
    const barHeight = Math.max(Math.min(rowHeight * 0.62, 18), 4);
    const activeTooltipPosition =
      activeDatum && activeIndex !== null
        ? tooltipCoordinates({
            chartWidth,
            height,
            x: xScale(activeDatum.value),
            y: padding.top + activeIndex * rowHeight + rowHeight / 2,
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
              {xTicks.map((value) => (
                <line
                  key={`bar-x-grid:${value}`}
                  stroke={chartTheme.grid}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  x1={xScale(value)}
                  x2={xScale(value)}
                  y1={padding.top}
                  y2={padding.top + innerHeight}
                />
              ))}
              <line
                stroke={chartTheme.grid}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                x1={zeroX}
                x2={zeroX}
                y1={padding.top}
                y2={padding.top + innerHeight}
              />
              {xTicks.map((value) => (
                <text
                  className="qitu-number"
                  fill={chartTheme.text}
                  fontSize="11"
                  key={`bar-x-label:${value}`}
                  textAnchor="middle"
                  x={xScale(value)}
                  y={height - 10}
                >
                  {formatValue(value)}
                </text>
              ))}
              <g role="list">
                {normalizedData.map((datum, index) => {
                  const rowTop = padding.top + index * rowHeight;
                  const y = rowTop + (rowHeight - barHeight) / 2;
                  const valueX = xScale(datum.value);
                  const x = datum.value >= 0 ? zeroX : valueX;
                  const barWidth = Math.abs(valueX - zeroX);
                  const isActive = activeIndex === index;
                  return (
                    <g
                      aria-label={`${datum.label}: ${valueLabel} ${formatValue(datum.value)}, ${shareLabel} ${formatShare(categoryShare(datum.value, total, shareBasis))}`}
                      key={`${datum.label}:${index}`}
                      opacity={categoryOpacity(index, activeIndex)}
                      role="listitem"
                      tabIndex={0}
                      onBlur={() => setActiveIndex(null)}
                      onFocus={() => setActiveIndex(index)}
                      onPointerEnter={() => setActiveIndex(index)}
                    >
                      <title>{`${datum.label}: ${formatValue(datum.value)}`}</title>
                      {isActive ? (
                        <rect
                          fill="var(--qitu-surface-row-hover)"
                          height={rowHeight}
                          opacity="0.72"
                          width={chartWidth}
                          x="0"
                          y={rowTop}
                        />
                      ) : null}
                      <rect
                        fill="transparent"
                        height={rowHeight}
                        width={chartWidth}
                        x="0"
                        y={rowTop}
                      />
                      <text
                        dominantBaseline="middle"
                        fill={isActive ? "var(--qitu-text)" : chartTheme.text}
                        fontSize="10"
                        textAnchor="end"
                        x={padding.left - 10}
                        y={y + barHeight / 2}
                      >
                        {truncateLabel(datum.label, 18)}
                      </text>
                      <Bar
                        fill={toneColor(datum.tone)}
                        height={barHeight}
                        rx="3"
                        width={Math.max(barWidth, 1)}
                        x={x}
                        y={y}
                      />
                    </g>
                  );
                })}
              </g>
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
              data={normalizedData}
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

  const padding = { top: 18, right: 18, bottom: 36, left: 68 };
  const innerWidth = Math.max(chartWidth - padding.left - padding.right, 1);
  const innerHeight = Math.max(height - padding.top - padding.bottom, 1);
  const values = normalizedData.map((datum) => datum.value).filter(Number.isFinite);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const domain: [number, number] =
    min === max ? [min - Math.max(Math.abs(min) * 0.12, 1), max + 1] : [min, max];
  const barSlotWidth = innerWidth / normalizedData.length;
  const yScale = scaleLinear({
    domain,
    nice: true,
    range: [padding.top + innerHeight, padding.top],
  });
  const yDomain = yScale.domain() as [number, number];
  const yTicks = ticksFromScale(yScale, innerHeight >= 180 ? 5 : 4);
  const zeroY = yScale(clamp(0, yDomain[0], yDomain[1]));
  const activeTooltipPosition =
    activeDatum && activeIndex !== null
      ? tooltipCoordinates({
          chartWidth,
          height,
          x: padding.left + activeIndex * barSlotWidth + barSlotWidth / 2,
          y: yScale(activeDatum.value),
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
            <ChartGrid
              height={innerHeight}
              left={padding.left}
              top={padding.top}
              width={innerWidth}
              yScale={(value) => yScale(value)}
              yValues={yTicks}
            />
            <line
              stroke={chartTheme.grid}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              x1={padding.left}
              x2={padding.left + innerWidth}
              y1={zeroY}
              y2={zeroY}
            />
            {yTicks.map((value) => (
              <text
                className="qitu-number"
                dominantBaseline="middle"
                fill={chartTheme.text}
                fontSize="11"
                key={`bar-y-label:${value}`}
                textAnchor="end"
                x={padding.left - 10}
                y={yScale(value)}
              >
                {formatValue(value)}
              </text>
            ))}
            <g role="list">
              {normalizedData.map((datum, index) => {
                const x = padding.left + index * barSlotWidth + barSlotWidth * 0.16;
                const valueY = yScale(datum.value);
                const y = datum.value >= 0 ? valueY : zeroY;
                const barHeight = Math.abs(valueY - zeroY);
                const width = Math.max(barSlotWidth * 0.68, 4);
                const isActive = activeIndex === index;
                return (
                  <g
                    aria-label={`${datum.label}: ${valueLabel} ${formatValue(datum.value)}, ${shareLabel} ${formatShare(categoryShare(datum.value, total, shareBasis))}`}
                    key={`${datum.label}:${index}`}
                    opacity={categoryOpacity(index, activeIndex)}
                    role="listitem"
                    tabIndex={0}
                    onBlur={() => setActiveIndex(null)}
                    onFocus={() => setActiveIndex(index)}
                    onPointerEnter={() => setActiveIndex(index)}
                  >
                    <title>{`${datum.label}: ${formatValue(datum.value)}`}</title>
                    {isActive ? (
                      <rect
                        fill="var(--qitu-surface-row-hover)"
                        height={innerHeight}
                        opacity="0.64"
                        width={barSlotWidth}
                        x={padding.left + index * barSlotWidth}
                        y={padding.top}
                      />
                    ) : null}
                    <rect
                      fill="transparent"
                      height={innerHeight}
                      width={barSlotWidth}
                      x={padding.left + index * barSlotWidth}
                      y={padding.top}
                    />
                    <Bar
                      fill={toneColor(datum.tone)}
                      height={Math.max(barHeight, 1)}
                      rx="3"
                      width={width}
                      x={x}
                      y={y}
                    />
                    <text
                      fill={isActive ? "var(--qitu-text)" : chartTheme.text}
                      fontSize="10"
                      textAnchor="middle"
                      x={x + width / 2}
                      y={height - 12}
                    >
                      {truncateLabel(datum.label, 9)}
                    </text>
                  </g>
                );
              })}
            </g>
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
            data={normalizedData}
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
