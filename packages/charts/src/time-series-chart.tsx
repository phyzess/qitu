import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";

import { ChartGrid } from "./chart-grid";
import { ChartTooltip, tooltipAnnouncement, visuallyHiddenStyle } from "./chart-interaction";
import { ChartFrame } from "./chart-state";
import {
  clamp,
  extentOrFallback,
  formatValue,
  formatXValue,
  nearestPointIndex,
  normalizeX,
  paddedDomain,
  sampledPointTicks,
  ticksFromScale,
} from "./chart-utils";
import { timeSeriesNavigation } from "./time-series-interaction";
import { chartTheme, toneColor } from "./theme";
import type {
  ChartDatum,
  ChartState,
  TimeSeriesTooltipContext,
  TimeSeriesTooltipRow,
} from "./types";
import { useChartWidth } from "./use-chart-width";

export type TimeSeriesChartProps = {
  data: ChartDatum[];
  width?: number | undefined;
  height?: number | undefined;
  color?: string | undefined;
  formatX?: ((value: ChartDatum["x"], datum?: ChartDatum) => string) | undefined;
  formatY?: ((value: number, datum?: ChartDatum) => string) | undefined;
  getTooltipAnnouncement?:
    | ((datum: ChartDatum, context: TimeSeriesTooltipContext) => string)
    | undefined;
  keyboardInstructions?: string | undefined;
  label?: string | undefined;
  state?: ChartState | undefined;
  tooltipRows?:
    | ((datum: ChartDatum, context: TimeSeriesTooltipContext) => TimeSeriesTooltipRow[])
    | undefined;
  tooltipTitle?: ((datum: ChartDatum, context: TimeSeriesTooltipContext) => ReactNode) | undefined;
  valueLabel?: string | undefined;
  xLabel?: string | undefined;
};

export function TimeSeriesChart({
  color = chartTheme.colors.positive,
  data,
  formatX = (value) => formatXValue(value),
  formatY = (value) => formatValue(value),
  getTooltipAnnouncement,
  height = 220,
  keyboardInstructions = "Use the arrow keys, Home, and End to inspect points. Press Escape to clear the active point.",
  label = "Time series",
  state,
  tooltipRows,
  tooltipTitle,
  valueLabel = "Value",
  width = 560,
  xLabel = "X",
}: TimeSeriesChartProps) {
  const chart = useChartWidth(width);
  const descriptionId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const nextState = state ?? (data.length === 0 ? "empty" : "ready");
  if (nextState !== "ready") {
    return <ChartFrame height={height} state={nextState} title={label} />;
  }

  const chartWidth = chart.width;
  const padding = { top: 22, right: 20, bottom: 42, left: 68 };
  const innerWidth = Math.max(chartWidth - padding.left - padding.right, 1);
  const innerHeight = Math.max(height - padding.top - padding.bottom, 1);
  const points = data.map((datum, index) => ({
    ...datum,
    xValue: normalizeX(datum.x, index),
  }));
  const xDomain = extentOrFallback(
    points.map((point) => point.xValue),
    [0, 1],
  );
  const rawYDomain = paddedDomain(
    extentOrFallback(
      points.map((point) => point.y),
      [0, 1],
    ),
  );
  const xScale = scaleLinear({
    domain: xDomain,
    range: [padding.left, padding.left + innerWidth],
  });
  const yScale = scaleLinear({
    domain: rawYDomain,
    nice: true,
    range: [padding.top + innerHeight, padding.top],
  });
  const yDomain = yScale.domain() as [number, number];
  const yTicks = ticksFromScale(yScale, innerHeight >= 220 ? 5 : 4);
  const xTicks = sampledPointTicks(points, innerWidth >= 720 ? 5 : innerWidth >= 420 ? 4 : 3);
  const zeroY = yDomain[0] <= 0 && yDomain[1] >= 0 ? yScale(0) : null;
  const activePoint = activeIndex === null ? null : (points[activeIndex] ?? null);
  const activeX = activePoint ? xScale(activePoint.xValue) : null;
  const activeY = activePoint ? yScale(activePoint.y) : null;
  const activeContext: TimeSeriesTooltipContext | null = activePoint
    ? {
        datum: activePoint,
        firstDatum: points[0],
        index: activeIndex ?? 0,
        previousDatum: activeIndex && activeIndex > 0 ? points[activeIndex - 1] : undefined,
      }
    : null;
  const activeTooltipRows =
    activePoint && activeContext
      ? (tooltipRows?.(activePoint, activeContext) ??
        defaultTooltipRows(activePoint, formatX, formatY, xLabel, valueLabel))
      : [];
  const activeTitle =
    activePoint && activeContext
      ? (tooltipTitle?.(activePoint, activeContext) ??
        activePoint.label ??
        formatX(activePoint.x, activePoint))
      : null;
  const tooltipPosition =
    activeX === null || activeY === null
      ? null
      : chartTooltipCoordinates({ chartWidth, height, x: activeX, y: activeY });
  const activeAnnouncement =
    activePoint && activeContext
      ? (getTooltipAnnouncement?.(activePoint, activeContext) ??
        (activeTitle !== null && activeTitle !== undefined
          ? tooltipAnnouncement(activeTitle, activeTooltipRows)
          : ""))
      : "";

  function handlePointerMove(event: PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;

    const bounds = svg.getBoundingClientRect();
    const localX = (event.clientX - bounds.left) * (chartWidth / Math.max(bounds.width, 1));
    const xValue = xScale.invert(clamp(localX, padding.left, padding.left + innerWidth));
    setActiveIndex(nearestPointIndex(points, xValue));
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const result = timeSeriesNavigation(event.key, activeIndex, points.length);
    if (!result.handled) return;
    event.preventDefault();
    setActiveIndex(result.nextIndex);
  }

  return (
    <ChartFrame height={height}>
      <div ref={chart.ref} className="qitu-chart-root">
        <svg
          aria-describedby={descriptionId}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End Escape"
          aria-label={label}
          className="qitu-chart"
          height={height}
          role="img"
          tabIndex={0}
          viewBox={`0 0 ${chartWidth} ${height}`}
          width="100%"
          onBlur={() => setActiveIndex(null)}
          onFocus={() => setActiveIndex((current) => current ?? 0)}
          onKeyDown={handleKeyDown}
        >
          <title>{label}</title>
          <desc id={descriptionId}>{keyboardInstructions}</desc>
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
            x2={padding.left}
            y1={padding.top}
            y2={padding.top + innerHeight}
          />
          <line
            stroke={chartTheme.grid}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1={padding.left}
            x2={padding.left + innerWidth}
            y1={padding.top + innerHeight}
            y2={padding.top + innerHeight}
          />
          {yTicks.map((value) => (
            <text
              className="qitu-number"
              dominantBaseline="middle"
              fill={chartTheme.text}
              fontSize="11"
              key={`y-label:${value}`}
              textAnchor="end"
              x={padding.left - 10}
              y={yScale(value)}
            >
              {formatY(value)}
            </text>
          ))}
          {xTicks.map((point) => (
            <g key={`x-label:${point.xValue}:${point.y}`}>
              <line
                stroke={chartTheme.grid}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                x1={xScale(point.xValue)}
                x2={xScale(point.xValue)}
                y1={padding.top}
                y2={padding.top + innerHeight}
              />
              <text
                className="qitu-number"
                fill={chartTheme.text}
                fontSize="11"
                textAnchor={
                  point === xTicks[0] ? "start" : point === xTicks.at(-1) ? "end" : "middle"
                }
                x={xScale(point.xValue)}
                y={height - 11}
              >
                {formatX(point.x, point)}
              </text>
            </g>
          ))}
          {zeroY === null ? null : (
            <line
              stroke={chartTheme.grid}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              x1={padding.left}
              x2={padding.left + innerWidth}
              y1={zeroY}
              y2={zeroY}
            />
          )}
          <LinePath
            data={points}
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            x={(point) => xScale(point.xValue)}
            y={(point) => yScale(point.y)}
          />
          {points.map((point, index) => (
            <circle
              cx={xScale(point.xValue)}
              cy={yScale(point.y)}
              fill={point.tone ? toneColor(point.tone) : color}
              key={`${point.xValue}:${point.y}:${index}`}
              r="2.5"
              stroke={chartTheme.surface}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {activePoint && activeX !== null && activeY !== null ? (
            <g pointerEvents="none">
              <line
                stroke={color}
                strokeDasharray="3 4"
                strokeOpacity="0.58"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                x1={activeX}
                x2={activeX}
                y1={padding.top}
                y2={padding.top + innerHeight}
              />
              <line
                stroke={color}
                strokeDasharray="3 4"
                strokeOpacity="0.38"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                x1={padding.left}
                x2={padding.left + innerWidth}
                y1={activeY}
                y2={activeY}
              />
              <circle cx={activeX} cy={activeY} fill={color} opacity="0.16" r="10" />
              <circle
                cx={activeX}
                cy={activeY}
                fill={color}
                r="4"
                stroke={chartTheme.surface}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : null}
          <rect
            fill="transparent"
            height={innerHeight}
            role="presentation"
            width={innerWidth}
            x={padding.left}
            y={padding.top}
            onPointerLeave={() => setActiveIndex(null)}
            onPointerMove={handlePointerMove}
          />
        </svg>
        <span aria-atomic="true" aria-live="polite" role="status" style={visuallyHiddenStyle}>
          {activeAnnouncement}
        </span>
        {activePoint && activeTitle !== null && activeTitle !== undefined && tooltipPosition ? (
          <ChartTooltip
            left={tooltipPosition.left}
            rows={activeTooltipRows}
            title={activeTitle}
            top={tooltipPosition.top}
            width={tooltipPosition.width}
          />
        ) : null}
      </div>
    </ChartFrame>
  );
}

function defaultTooltipRows(
  datum: ChartDatum,
  formatX: (value: ChartDatum["x"], datum?: ChartDatum) => string,
  formatY: (value: number, datum?: ChartDatum) => string,
  xLabel: string,
  valueLabel: string,
): TimeSeriesTooltipRow[] {
  return [
    { label: xLabel, value: formatX(datum.x, datum) },
    { label: valueLabel, value: formatY(datum.y, datum) },
  ];
}

function chartTooltipCoordinates(input: {
  chartWidth: number;
  height: number;
  x: number;
  y: number;
}) {
  const tooltipWidth = Math.min(224, Math.max(176, input.chartWidth - 16));
  const maxLeft = Math.max(8, input.chartWidth - tooltipWidth - 8);
  const rightCandidate = input.x + 14;
  const leftCandidate = input.x - tooltipWidth - 14;
  const preferredLeft =
    rightCandidate + tooltipWidth <= input.chartWidth - 8 ? rightCandidate : leftCandidate;
  return {
    left: clamp(preferredLeft, 8, maxLeft),
    top: clamp(input.y - 56, 8, Math.max(8, input.height - 112)),
    width: tooltipWidth,
  };
}
