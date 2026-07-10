import { isValidElement, type CSSProperties, type ReactNode } from "react";

import { categoryShare, type CategoryShareBasis } from "./category-chart-utils";
import { chartToneForIndex, toneColor } from "./theme";
import type { CategoryDatum, ChartTone } from "./types";

export const visuallyHiddenStyle: CSSProperties = {
  border: 0,
  clipPath: "inset(50%)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
};

export function ChartTooltip(props: {
  left: number;
  rows: Array<{ label: string; value: ReactNode; tone?: ChartTone | undefined }>;
  title: ReactNode;
  top: number;
  width: number;
}) {
  return (
    <div
      className="qitu-chart-tooltip"
      style={{ left: props.left, top: props.top, width: props.width }}
    >
      <div className="qitu-chart-tooltip-title">{props.title}</div>
      <div className="qitu-chart-tooltip-rows">
        {props.rows.map((row, index) => (
          <div className="qitu-chart-tooltip-row" key={`${row.label}:${index}`}>
            <span className="qitu-chart-tooltip-label">{row.label}</span>
            <span
              className="qitu-chart-tooltip-value qitu-number"
              style={{ color: row.tone ? toneColor(row.tone) : undefined }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryChartCaption(props: { children?: ReactNode | undefined }) {
  if (!props.children) return null;
  return <div className="qitu-chart-caption">{props.children}</div>;
}

export function CategoryLegend(props: {
  activeIndex: number | null;
  data: CategoryDatum[];
  formatShare: (share: number) => string;
  formatValue: (value: number) => string;
  onActiveIndexChange: (index: number | null) => void;
  shareBasis: CategoryShareBasis;
  shareLabel: string;
  total: number;
  valueLabel: string;
}) {
  return (
    <div
      className="qitu-chart-legend"
      role="list"
      onPointerLeave={() => props.onActiveIndexChange(null)}
    >
      {props.data.map((datum, index) => {
        const color = toneColor(datum.tone ?? chartToneForIndex(index));
        const isActive = props.activeIndex === index;
        const share = categoryShare(datum.value, props.total, props.shareBasis);

        return (
          <div className="qitu-chart-legend-entry" key={`${datum.label}:${index}`} role="listitem">
            <button
              aria-label={`${datum.label}: ${props.valueLabel} ${props.formatValue(datum.value)}, ${props.shareLabel} ${props.formatShare(share)}`}
              className="qitu-chart-legend-item"
              data-active={isActive ? "true" : "false"}
              data-dimmed={props.activeIndex !== null && !isActive ? "true" : "false"}
              type="button"
              onBlur={() => props.onActiveIndexChange(null)}
              onClick={() => props.onActiveIndexChange(isActive ? null : index)}
              onFocus={() => props.onActiveIndexChange(index)}
              onPointerEnter={() => props.onActiveIndexChange(index)}
            >
              <span
                aria-hidden="true"
                className="qitu-chart-legend-swatch"
                style={{ background: color }}
              />
              <span className="qitu-chart-legend-copy">
                <span className="qitu-chart-legend-label">{datum.label}</span>
                <span className="qitu-chart-legend-value qitu-number">
                  {props.formatValue(datum.value)}
                </span>
              </span>
              <span className="qitu-chart-legend-share qitu-number">
                {props.formatShare(share)}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function tooltipAnnouncement(
  title: ReactNode,
  rows: Array<{ label: string; value: ReactNode }>,
): string {
  return [
    textFromReactNode(title),
    ...rows.map((row) => {
      const value = textFromReactNode(row.value);
      return value ? `${row.label}: ${value}` : row.label;
    }),
  ]
    .filter(Boolean)
    .join(". ");
}

function textFromReactNode(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textFromReactNode).filter(Boolean).join(" ");
  if (isValidElement<{ children?: ReactNode }>(value))
    return textFromReactNode(value.props.children);
  return "";
}
