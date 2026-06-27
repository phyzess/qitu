import type { ReactNode } from "react";
import { cn } from "./utils";

export type StatusBadgeTone = "neutral" | "active" | "warning" | "danger";

const toneClass: Record<StatusBadgeTone, string> = {
  neutral: "bg-[var(--color-panel-subtle)] text-[var(--color-text-muted)]",
  active: "bg-teal-50 text-teal-800",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-800",
};

export type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusBadgeTone;
  className?: string;
};

export function StatusBadge({ children, className, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
