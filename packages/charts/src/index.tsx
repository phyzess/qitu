import type { CSSProperties, ReactNode } from "react";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";

export type ChartState = "ready" | "loading" | "empty" | "error" | "partial";
export type ChartTone = "neutral" | "positive" | "negative" | "warning" | "info";

export type ChartDatum = {
  x: string | number | Date;
  y: number;
  label?: string | undefined;
  tone?: ChartTone | undefined;
};

export type CategoryDatum = {
  label: string;
  value: number;
  tone?: ChartTone | undefined;
};

export type ScatterDatum = {
  x: number;
  y: number;
  label?: string | undefined;
  tone?: ChartTone | undefined;
};

export const chartTheme = {
  colors: {
    neutral: "var(--qitu-text)",
    positive: "var(--qitu-green)",
    negative: "var(--qitu-red)",
    warning: "var(--qitu-amber)",
    info: "var(--qitu-blue)",
  },
  grid: "var(--qitu-line)",
  text: "var(--qitu-dim)",
  surface: "var(--qitu-surface-2)",
} as const;

export type ChartFrameProps = {
  children?: ReactNode;
  state?: ChartState | undefined;
  title?: string | undefined;
  description?: string | undefined;
  height?: number | undefined;
  className?: string | undefined;
};

export function ChartFrame({
  children,
  className,
  description,
  height = 220,
  state = "ready",
  title,
}: ChartFrameProps) {
  const style = {
    minHeight: height,
    padding: "var(--qitu-space-s0)",
  } satisfies CSSProperties;

  if (state !== "ready") {
    return (
      <div className={["qitu-surface-subtle", className].filter(Boolean).join(" ")} style={style}>
        <ChartStateView description={description} state={state} title={title} />
      </div>
    );
  }

  return (
    <div className={["qitu-surface-subtle", className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}

export function ChartStateView(props: {
  state: Exclude<ChartState, "ready">;
  title?: string | undefined;
  description?: string | undefined;
}) {
  return (
    <div
      style={{
        alignItems: "center",
        color: "var(--qitu-muted)",
        display: "grid",
        minHeight: 160,
        placeItems: "center",
        textAlign: "center",
      }}
    >
      <div>
        <div
          style={{
            color: props.state === "error" ? "var(--qitu-red)" : "var(--qitu-text)",
            fontSize: "var(--qitu-text-label-14)",
            fontWeight: 600,
            lineHeight: "var(--qitu-leading-label-14)",
          }}
        >
          {props.title ?? chartStateTitle(props.state)}
        </div>
        <div
          style={{
            fontSize: "var(--qitu-text-copy-13)",
            lineHeight: "var(--qitu-leading-copy-13)",
            marginTop: "var(--qitu-space-s-3)",
          }}
        >
          {props.description ?? chartStateDescription(props.state)}
        </div>
      </div>
    </div>
  );
}

export function ChartEmptyState(props: {
  title?: string | undefined;
  description?: string | undefined;
}) {
  return <ChartStateView description={props.description} state="empty" title={props.title} />;
}

export function ChartLoadingState(props: {
  title?: string | undefined;
  description?: string | undefined;
}) {
  return <ChartStateView description={props.description} state="loading" title={props.title} />;
}

export type TimeSeriesChartProps = {
  data: ChartDatum[];
  width?: number | undefined;
  height?: number | undefined;
  color?: string | undefined;
  label?: string | undefined;
  state?: ChartState | undefined;
};

export function TimeSeriesChart({
  color = chartTheme.colors.positive,
  data,
  height = 220,
  label = "Time series",
  state,
  width = 560,
}: TimeSeriesChartProps) {
  const nextState = state ?? (data.length === 0 ? "empty" : "ready");
  if (nextState !== "ready") {
    return <ChartFrame height={height} state={nextState} title={label} />;
  }

  const padding = {
    top: 18,
    right: 18,
    bottom: 30,
    left: 44,
  };
  const innerWidth = Math.max(width - padding.left - padding.right, 1);
  const innerHeight = Math.max(height - padding.top - padding.bottom, 1);
  const points = data.map((datum, index) => ({
    ...datum,
    xValue: normalizeX(datum.x, index),
  }));
  const xValues = points.map((point) => point.xValue);
  const yValues = points.map((point) => point.y);
  const xDomain = extentOrFallback(xValues, [0, 1]);
  const yDomain = paddedDomain(extentOrFallback(yValues, [0, 1]));
  const xScale = scaleLinear({
    domain: xDomain,
    range: [padding.left, padding.left + innerWidth],
  });
  const yScale = scaleLinear({
    domain: yDomain,
    nice: true,
    range: [padding.top + innerHeight, padding.top],
  });
  const lastPoint = points.at(-1);
  const zeroY = yDomain[0] <= 0 && yDomain[1] >= 0 ? yScale(0) : padding.top + innerHeight;

  return (
    <ChartFrame height={height}>
      <svg
        aria-label={label}
        className="qitu-chart"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
      >
        <ChartGrid
          height={innerHeight}
          left={padding.left}
          top={padding.top}
          width={innerWidth}
          yScale={(value) => yScale(value)}
          yValues={ticksForDomain(yDomain)}
        />
        <line
          stroke={chartTheme.grid}
          strokeWidth="1"
          x1={padding.left}
          x2={padding.left + innerWidth}
          y1={zeroY}
          y2={zeroY}
        />
        <LinePath
          data={points}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          x={(point) => xScale(point.xValue)}
          y={(point) => yScale(point.y)}
        />
        {points.map((point) => (
          <circle
            cx={xScale(point.xValue)}
            cy={yScale(point.y)}
            fill={point.tone ? toneColor(point.tone) : color}
            key={`${point.xValue}:${point.y}`}
            r="2.75"
            stroke="var(--qitu-surface-2)"
            strokeWidth="2"
          />
        ))}
        {lastPoint ? (
          <text
            className="qitu-number"
            fill={chartTheme.text}
            fontSize="11"
            textAnchor="end"
            x={padding.left + innerWidth}
            y={height - 9}
          >
            {formatValue(lastPoint.y)}
          </text>
        ) : null}
      </svg>
    </ChartFrame>
  );
}

export type BarChartProps = {
  data: CategoryDatum[];
  width?: number | undefined;
  height?: number | undefined;
  label?: string | undefined;
  state?: ChartState | undefined;
};

export function BarChart({
  data,
  height = 220,
  label = "Bar chart",
  state,
  width = 560,
}: BarChartProps) {
  const nextState = state ?? (data.length === 0 ? "empty" : "ready");
  if (nextState !== "ready") {
    return <ChartFrame height={height} state={nextState} title={label} />;
  }

  const padding = { top: 18, right: 18, bottom: 36, left: 42 };
  const innerWidth = Math.max(width - padding.left - padding.right, 1);
  const innerHeight = Math.max(height - padding.top - padding.bottom, 1);
  const max = Math.max(...data.map((datum) => datum.value), 1);
  const barWidth = innerWidth / data.length;
  const yScale = scaleLinear({
    domain: [0, max],
    nice: true,
    range: [padding.top + innerHeight, padding.top],
  });

  return (
    <ChartFrame height={height}>
      <svg aria-label={label} role="img" viewBox={`0 0 ${width} ${height}`} width="100%">
        <ChartGrid
          height={innerHeight}
          left={padding.left}
          top={padding.top}
          width={innerWidth}
          yScale={(value) => yScale(value)}
          yValues={ticksForDomain([0, max])}
        />
        {data.map((datum, index) => {
          const x = padding.left + index * barWidth + barWidth * 0.16;
          const y = yScale(datum.value);
          const h = padding.top + innerHeight - y;
          return (
            <g key={datum.label}>
              <rect
                fill={toneColor(datum.tone ?? "info")}
                height={Math.max(h, 1)}
                rx="3"
                width={Math.max(barWidth * 0.68, 4)}
                x={x}
                y={y}
              />
              <text
                fill={chartTheme.text}
                fontSize="10"
                textAnchor="middle"
                x={x + Math.max(barWidth * 0.68, 4) / 2}
                y={height - 12}
              >
                {truncateLabel(datum.label, 9)}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}

export type DonutChartProps = {
  data: CategoryDatum[];
  width?: number | undefined;
  height?: number | undefined;
  label?: string | undefined;
  state?: ChartState | undefined;
};

export function DonutChart({
  data,
  height = 220,
  label = "Donut chart",
  state,
  width = 320,
}: DonutChartProps) {
  const nextState = state ?? (data.length === 0 ? "empty" : "ready");
  if (nextState !== "ready") {
    return <ChartFrame height={height} state={nextState} title={label} />;
  }

  const total = data.reduce((sum, datum) => sum + Math.max(datum.value, 0), 0);
  if (total === 0) {
    return <ChartFrame height={height} state="empty" title={label} />;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const strokeWidth = Math.max(radius * 0.26, 12);
  let current = -90;

  return (
    <ChartFrame height={height}>
      <svg aria-label={label} role="img" viewBox={`0 0 ${width} ${height}`} width="100%">
        <circle
          cx={centerX}
          cy={centerY}
          fill="none"
          r={radius}
          stroke="var(--qitu-line)"
          strokeWidth={strokeWidth}
        />
        {data.map((datum, index) => {
          const sweep = (Math.max(datum.value, 0) / total) * 360;
          const start = current;
          const end = current + sweep;
          current = end;
          return (
            <path
              d={donutArcPath(centerX, centerY, radius, start, end)}
              fill="none"
              key={datum.label}
              stroke={toneColor(datum.tone ?? chartToneForIndex(index))}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
            />
          );
        })}
        <text
          className="qitu-number"
          fill="var(--qitu-text)"
          fontSize="18"
          fontWeight="600"
          textAnchor="middle"
          x={centerX}
          y={centerY - 2}
        >
          {formatValue(total)}
        </text>
        <text fill={chartTheme.text} fontSize="11" textAnchor="middle" x={centerX} y={centerY + 18}>
          total
        </text>
      </svg>
    </ChartFrame>
  );
}

export type ComparisonScatterChartProps = {
  data: ScatterDatum[];
  width?: number | undefined;
  height?: number | undefined;
  label?: string | undefined;
  state?: ChartState | undefined;
};

export function ComparisonScatterChart({
  data,
  height = 240,
  label = "Comparison scatter",
  state,
  width = 560,
}: ComparisonScatterChartProps) {
  const nextState = state ?? (data.length === 0 ? "empty" : "ready");
  if (nextState !== "ready") {
    return <ChartFrame height={height} state={nextState} title={label} />;
  }

  const padding = { top: 18, right: 18, bottom: 34, left: 42 };
  const innerWidth = Math.max(width - padding.left - padding.right, 1);
  const innerHeight = Math.max(height - padding.top - padding.bottom, 1);
  const xDomain = paddedDomain(
    extentOrFallback(
      data.map((datum) => datum.x),
      [0, 1],
    ),
  );
  const yDomain = paddedDomain(
    extentOrFallback(
      data.map((datum) => datum.y),
      [0, 1],
    ),
  );
  const xScale = scaleLinear({
    domain: xDomain,
    range: [padding.left, padding.left + innerWidth],
  });
  const yScale = scaleLinear({
    domain: yDomain,
    nice: true,
    range: [padding.top + innerHeight, padding.top],
  });

  return (
    <ChartFrame height={height}>
      <svg aria-label={label} role="img" viewBox={`0 0 ${width} ${height}`} width="100%">
        <ChartGrid
          height={innerHeight}
          left={padding.left}
          top={padding.top}
          width={innerWidth}
          yScale={(value) => yScale(value)}
          yValues={ticksForDomain(yDomain)}
        />
        {data.map((datum, index) => (
          <circle
            cx={xScale(datum.x)}
            cy={yScale(datum.y)}
            fill={toneColor(datum.tone ?? chartToneForIndex(index))}
            key={`${datum.label ?? index}:${datum.x}:${datum.y}`}
            r="4"
            stroke="var(--qitu-surface-2)"
            strokeWidth="2"
          />
        ))}
      </svg>
    </ChartFrame>
  );
}

function ChartGrid(props: {
  left: number;
  top: number;
  width: number;
  height: number;
  yValues: number[];
  yScale: (value: number) => number;
}) {
  return (
    <>
      {props.yValues.map((value) => (
        <line
          key={value}
          stroke={chartTheme.grid}
          strokeWidth="1"
          x1={props.left}
          x2={props.left + props.width}
          y1={props.yScale(value)}
          y2={props.yScale(value)}
        />
      ))}
      <rect
        fill="none"
        height={props.height}
        stroke="var(--qitu-line-strong)"
        strokeWidth="1"
        width={props.width}
        x={props.left}
        y={props.top}
      />
    </>
  );
}

function normalizeX(value: ChartDatum["x"], fallback: number): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function extentOrFallback(values: number[], fallback: [number, number]): [number, number] {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return fallback;
  }

  return [Math.min(...finiteValues), Math.max(...finiteValues)];
}

function paddedDomain(domain: [number, number]): [number, number] {
  if (domain[0] === domain[1]) {
    const offset = Math.max(Math.abs(domain[0]) * 0.12, 1);
    return [domain[0] - offset, domain[1] + offset];
  }

  const span = domain[1] - domain[0];
  return [domain[0] - span * 0.08, domain[1] + span * 0.08];
}

function ticksForDomain(domain: [number, number]): number[] {
  const [min, max] = domain;
  const step = (max - min) / 3;
  return [min, min + step, min + step * 2, max];
}

function formatValue(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
  }).format(value);
}

function toneColor(tone: ChartTone): string {
  return chartTheme.colors[tone];
}

function chartToneForIndex(index: number): ChartTone {
  return (["positive", "info", "warning", "negative", "neutral"] as const)[index % 5] ?? "info";
}

function truncateLabel(label: string, maxLength: number): string {
  return label.length <= maxLength ? label : `${label.slice(0, Math.max(maxLength - 1, 1))}.`;
}

function chartStateTitle(state: Exclude<ChartState, "ready">): string {
  return {
    empty: "No data",
    error: "Chart unavailable",
    loading: "Loading",
    partial: "Partial data",
  }[state];
}

function chartStateDescription(state: Exclude<ChartState, "ready">): string {
  return {
    empty: "There is not enough source data to render this chart.",
    error: "The data source returned an error.",
    loading: "Waiting for the data source.",
    partial: "Some source data is missing or delayed.",
  }[state];
}

function donutArcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}
