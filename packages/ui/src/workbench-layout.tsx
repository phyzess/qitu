import type { HTMLAttributes } from "react";

import { cn } from "./utils";

export type WorkbenchGridLayout = "context" | "context-wide" | "data" | "split";

export function WorkbenchPage({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("qitu-page-flow", className)} {...props}>
      {children}
    </div>
  );
}

export function WorkbenchGrid({
  children,
  className,
  layout = "context",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  layout?: WorkbenchGridLayout | undefined;
}) {
  return (
    <div className={cn("qitu-workbench-grid", className)} data-layout={layout} {...props}>
      {children}
    </div>
  );
}

export function ContextPanel({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <aside className={cn("qitu-context-panel", className)} {...props}>
      {children}
    </aside>
  );
}
