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
          <span className="mt-0.5 text-[var(--green)]" aria-hidden="true">
            {props.icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[length:var(--text-heading-16)] font-semibold leading-[var(--leading-heading-16)] text-[var(--text)]">
            {props.title}
          </h2>
          {props.description ? (
            <p className="mt-[var(--s-3)] text-[length:var(--text-copy-13)] leading-[var(--leading-copy-13)] text-[var(--dim)]">
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
        "qitu-surface-subtle grid min-h-28 place-items-center px-4 py-6 text-center",
        props.className,
      )}
    >
      <div className="max-w-[34rem]">
        <div className="mx-auto mb-3 grid size-8 place-items-center rounded-full bg-[rgb(255_255_255_/_0.055)] text-[var(--muted)]">
          {icon}
        </div>
        {props.title ? (
          <div className="text-[length:var(--text-label-14)] font-medium leading-[var(--leading-label-14)] text-[var(--text)]">
            {props.title}
          </div>
        ) : null}
        {props.description ? (
          <div className="mt-1 text-[length:var(--text-copy-13)] leading-[var(--leading-copy-13)] text-[var(--muted)]">
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
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", props.className)}>
      {props.items.map((item) => (
        <div
          className="qitu-surface-subtle min-h-[calc(var(--s3)+var(--s1))] p-[var(--s0)]"
          key={item.id}
        >
          <div className="text-[length:var(--text-label-12)] leading-[var(--leading-label-12)] text-[var(--dim)]">
            {item.label}
          </div>
          <div
            className={cn(
              "qitu-number mt-[var(--s-1)] text-[length:var(--text-heading-20)] font-semibold leading-[var(--leading-heading-20)]",
              item.tone === "positive" && "text-[var(--green)]",
              item.tone === "negative" && "text-[var(--red)]",
              item.tone === "warning" && "text-[var(--amber)]",
              (!item.tone || item.tone === "neutral") && "text-[var(--text)]",
            )}
          >
            {item.value}
          </div>
          {item.meta ? (
            <div className="mt-[var(--s-3)] truncate text-[length:var(--text-label-12)] leading-[var(--leading-label-12)] text-[var(--dim)]">
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
    <div className={cn("space-y-3", props.className)}>
      {props.items.map((item) => (
        <div className="qitu-surface-subtle p-3" key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  item.tone === "success" && "bg-[var(--green)]",
                  item.tone === "warning" && "bg-[var(--amber)]",
                  item.tone === "error" && "bg-[var(--red)]",
                  item.tone === "info" && "bg-[var(--blue)]",
                  (!item.tone || item.tone === "neutral") && "bg-[var(--dim)]",
                )}
              />
              <div className="min-w-0">
                <div className="truncate text-[length:var(--text-label-14)] font-medium leading-[var(--leading-label-14)] text-[var(--text)]">
                  {item.title}
                </div>
                {item.description ? (
                  <div className="mt-1 text-[length:var(--text-copy-13)] leading-[var(--leading-copy-13)] text-[var(--muted)]">
                    {item.description}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="qitu-number shrink-0 text-[length:var(--text-label-12)] leading-[var(--leading-label-12)] text-[var(--dim)]">
              {item.time}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
