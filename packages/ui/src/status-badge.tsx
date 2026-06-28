import type { ReactNode } from "react";
import { cn } from "./utils";

export type StatusBadgeTone =
  | "neutral"
  | "active"
  | "success"
  | "warning"
  | "danger"
  | "review"
  | "info";

const toneClass: Record<StatusBadgeTone, string> = {
  neutral: "bg-[var(--surface-row-active)] text-[var(--muted)]",
  active: "bg-[var(--chroma-lime-soft)] text-[var(--chroma-lime-ink)]",
  success: "bg-[var(--chroma-lime-soft)] text-[var(--chroma-lime-ink)]",
  warning: "bg-[var(--chroma-pink-soft)] text-[var(--chroma-pink-ink)]",
  danger: "bg-[var(--danger-soft)] text-[var(--red)]",
  review: "bg-[var(--chroma-lilac-soft)] text-[var(--chroma-lilac-ink)]",
  info: "bg-[var(--chroma-lilac-soft)] text-[var(--chroma-lilac-ink)]",
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
        "inline-flex min-h-[22px] items-center rounded-[var(--radius-md)] px-[var(--o3)] py-[var(--o0)] text-[10px] font-medium leading-4",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
