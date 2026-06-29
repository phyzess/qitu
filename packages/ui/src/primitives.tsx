import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { cn } from "./utils";

export function Surface(props: {
  children: ReactNode;
  className?: string | undefined;
  as?: "section" | "article" | "aside" | "div" | undefined;
}) {
  const Component = props.as ?? "section";
  return (
    <Component className={cn("qitu-surface min-w-0", props.className)}>{props.children}</Component>
  );
}

export function SectionHeader(props: {
  title: string;
  description?: string | undefined;
  icon?: ReactNode | undefined;
  action?: ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("flex min-w-0 items-start justify-between gap-3", props.className)}>
      <div className="flex min-w-0 items-start gap-2">
        {props.icon ? (
          <span className="mt-0.5 text-[var(--qitu-chroma-lime-ink)]" aria-hidden="true">
            {props.icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)] text-[var(--qitu-text)]">
            {props.title}
          </h2>
          {props.description ? (
            <p className="mt-[var(--qitu-space-s-3)] text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-dim)]">
              {props.description}
            </p>
          ) : null}
        </div>
      </div>
      {props.action ? <div className="shrink-0">{props.action}</div> : null}
    </div>
  );
}

export type DataStateKind = "loading" | "empty" | "error" | "partial" | "ready";

export function DataState(props: {
  state: DataStateKind;
  title?: string | undefined;
  description?: string | undefined;
  action?: ReactNode | undefined;
  children?: ReactNode | undefined;
  className?: string | undefined;
}) {
  if (props.state === "ready") {
    return <>{props.children}</>;
  }

  const icon = {
    loading: <Loader2 aria-hidden="true" className="animate-spin" size={16} />,
    empty: <CircleDashed aria-hidden="true" size={16} />,
    error: <AlertCircle aria-hidden="true" size={16} />,
    partial: <CheckCircle2 aria-hidden="true" size={16} />,
  }[props.state];

  return (
    <div
      className={cn(
        "qitu-surface-subtle grid min-h-28 place-items-center px-[var(--qitu-space-o4)] py-[var(--qitu-space-o5)] text-center",
        props.className,
      )}
    >
      <div className="max-w-[34rem]">
        <div className="mx-auto mb-3 grid size-8 place-items-center rounded-[var(--qitu-radius-md)] bg-[var(--qitu-surface-row-active)] text-[var(--qitu-muted)]">
          {icon}
        </div>
        {props.title ? (
          <div className="text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)] text-[var(--qitu-text)]">
            {props.title}
          </div>
        ) : null}
        {props.description ? (
          <div className="mt-1 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
            {props.description}
          </div>
        ) : null}
        {props.action ? <div className="mt-4 flex justify-center">{props.action}</div> : null}
      </div>
    </div>
  );
}

export type MetricItem = {
  id: string;
  label: string;
  value: string | number;
  tone?: "neutral" | "positive" | "negative" | "warning" | undefined;
  meta?: string | undefined;
};

export function MetricStrip(props: { items: MetricItem[]; className?: string | undefined }) {
  return (
    <div
      className={cn("grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-3", props.className)}
    >
      {props.items.map((item) => (
        <div className="qitu-surface-subtle min-h-[86px] p-[var(--qitu-space-o4)]" key={item.id}>
          <div className="text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
            {item.label}
          </div>
          <div
            className={cn(
              "qitu-number mt-[var(--qitu-space-s-1)] text-[length:var(--qitu-text-heading-20)] font-semibold leading-[var(--qitu-leading-heading-20)]",
              item.tone === "positive" && "text-[var(--qitu-chroma-lime-ink)]",
              item.tone === "negative" && "text-[var(--qitu-red)]",
              item.tone === "warning" && "text-[var(--qitu-chroma-pink-ink)]",
              (!item.tone || item.tone === "neutral") && "text-[var(--qitu-text)]",
            )}
          >
            {item.value}
          </div>
          {item.meta ? (
            <div className="mt-[var(--qitu-space-s-3)] truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
              {item.meta}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export type TimelineItem = {
  id: string;
  time: string;
  title: string;
  description?: string | undefined;
  tone?: "neutral" | "success" | "warning" | "error" | "info" | undefined;
};

export function Timeline(props: {
  items: TimelineItem[];
  emptyLabel?: string | undefined;
  className?: string | undefined;
}) {
  if (props.items.length === 0) {
    return (
      <DataState
        className={props.className}
        description={props.emptyLabel ?? "No events have been recorded yet."}
        state="empty"
        title="No events"
      />
    );
  }

  return (
    <div className={cn("space-y-[var(--qitu-space-o3)]", props.className)}>
      {props.items.map((item) => (
        <div className="qitu-surface-subtle p-[var(--qitu-space-o4)]" key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  item.tone === "success" && "bg-[var(--qitu-chroma-lime-ink)]",
                  item.tone === "warning" && "bg-[var(--qitu-chroma-pink-ink)]",
                  item.tone === "error" && "bg-[var(--qitu-red)]",
                  item.tone === "info" && "bg-[var(--qitu-chroma-lilac-ink)]",
                  (!item.tone || item.tone === "neutral") && "bg-[var(--qitu-dim)]",
                )}
              />
              <div className="min-w-0">
                <div className="truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)] text-[var(--qitu-text)]">
                  {item.title}
                </div>
                {item.description ? (
                  <div className="mt-1 text-[length:var(--qitu-text-copy-13)] leading-[var(--qitu-leading-copy-13)] text-[var(--qitu-muted)]">
                    {item.description}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="qitu-number shrink-0 text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
              {item.time}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
