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
  neutral: "bg-[rgb(255_255_255_/_0.055)] text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]",
  active: "bg-[rgb(25_201_135_/_0.12)] text-[var(--green)]",
  success: "bg-[rgb(25_201_135_/_0.12)] text-[var(--green)]",
  warning: "bg-[rgb(231_183_95_/_0.14)] text-[var(--amber)]",
  danger: "bg-[rgb(240_97_97_/_0.14)] text-[var(--red)]",
  review: "bg-[rgb(140_183_255_/_0.14)] text-[var(--blue)]",
  info: "bg-[rgb(140_183_255_/_0.14)] text-[var(--blue)]",
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
