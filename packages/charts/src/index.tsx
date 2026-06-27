import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";

export type ChartDatum = {
  x: string | number | Date;
  y: number;
  label?: string;
};

export const chartTheme = {
  colors: ["#0f766e", "#111827", "#7c3aed", "#b45309"],
  grid: "#e2e1dc",
  text: "#666661",
} as const;

export type TimeSeriesChartProps = {
  data: ChartDatum[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
};

export function TimeSeriesChart({
  data,
  width = 560,
  height = 220,
  color = chartTheme.colors[0],
  label = "Time series",
}: TimeSeriesChartProps) {
  const padding = {
    top: 16,
    right: 18,
    bottom: 28,
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
  const yDomain = extentOrFallback(yValues, [0, 1]);
  const xScale = scaleLinear({
    domain: xDomain,
    range: [padding.left, padding.left + innerWidth],
  });
  const yScale = scaleLinear({
    domain: yDomain[0] === yDomain[1] ? [yDomain[0] - 1, yDomain[1] + 1] : yDomain,
    nice: true,
    range: [padding.top + innerHeight, padding.top],
  });
  const lastPoint = points.at(-1);

  return (
    <svg
      aria-label={label}
      className="qitu-chart"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
    >
      <line
        stroke={chartTheme.grid}
        strokeWidth="1"
        x1={padding.left}
        x2={padding.left + innerWidth}
        y1={padding.top + innerHeight}
        y2={padding.top + innerHeight}
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
      {lastPoint ? (
        <circle
          cx={xScale(lastPoint.xValue)}
          cy={yScale(lastPoint.y)}
          fill={color}
          r="3"
          stroke="white"
          strokeWidth="2"
        />
      ) : null}
      <text
        fill={chartTheme.text}
        fontSize="11"
        textAnchor="end"
        x={padding.left + innerWidth}
        y={height - 8}
      >
        {lastPoint ? formatValue(lastPoint.y) : "No data"}
      </text>
    </svg>
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
  if (values.length === 0) {
    return fallback;
  }

  return [Math.min(...values), Math.max(...values)];
}

function formatValue(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
  }).format(value);
}
