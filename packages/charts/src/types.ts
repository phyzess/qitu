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

export type TimeSeriesTooltipContext = {
  datum: ChartDatum;
  firstDatum?: ChartDatum | undefined;
  index: number;
  previousDatum?: ChartDatum | undefined;
};

export type TimeSeriesTooltipRow = {
  label: string;
  value: ReactNode;
  tone?: ChartTone | undefined;
};

export type CategoryTooltipContext = {
  datum: CategoryDatum;
  index: number;
  share: number;
  total: number;
};

export type CategoryTooltipRow = {
  label: string;
  value: ReactNode;
  tone?: ChartTone | undefined;
};

export type CategoryChartLegendMode = "none" | "inline";
import type { ReactNode } from "react";
