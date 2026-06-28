import type { ReactNode } from "react";
import { StatusBadge } from "@qitu/ui";
import { Activity, LockKeyhole } from "lucide-react";

export const nav = [
  { label: "Overview" },
  { label: "Sources" },
  { label: "Imports" },
  { label: "Reviews", active: true },
  { label: "Audit" },
];

export function Panel(props: { children: ReactNode }) {
  return <div className="qitu-card p-5">{props.children}</div>;
}

export function SectionTitle(props: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <span className="text-[var(--color-accent)]">{props.icon}</span>
      {props.label}
    </div>
  );
}

export function AuthLinkLayout(props: {
  badge: string;
  children: ReactNode;
  description: string;
  notice: string;
  title: string;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[1fr_0.8fr]">
      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <StatusBadge tone="warning">{props.badge}</StatusBadge>
            <h1 className="mt-3 text-xl font-semibold tracking-normal">{props.title}</h1>
            <div className="mt-2 max-w-[36rem] text-sm leading-6 text-[var(--color-text-muted)]">
              {props.description}
            </div>
          </div>
          <LockKeyhole size={18} className="text-[var(--color-accent)]" />
        </div>
        {props.children}
      </Panel>

      <Panel>
        <SectionTitle icon={<Activity size={16} />} label="Runtime" />
        <div className="mt-4 space-y-3">
          <RuntimeRow label="Worker" value="/api" />
          <RuntimeRow label="Session" value={props.notice} />
        </div>
      </Panel>
    </div>
  );
}

export function RuntimeRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-panel-subtle)] px-3 py-2">
      <div className="text-sm text-[var(--color-text-muted)]">{props.label}</div>
      <div className="qitu-number text-xs">{props.value}</div>
    </div>
  );
}

export function Field(props: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--color-text-muted)]">{props.label}</span>
      <input
        className="mt-2 block w-full rounded-lg bg-[var(--color-panel-subtle)] px-3 py-2 text-sm outline-none ring-0 focus:bg-white focus:shadow-[0_0_0_2px_var(--color-accent)]"
        onChange={(event) => props.onChange(event.target.value)}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

export function ErrorText(props: { children: ReactNode }) {
  return <div className="mt-4 text-sm text-[var(--color-danger)]">{props.children}</div>;
}

export function EmptyText(props: { children: ReactNode }) {
  return <div className="text-sm text-[var(--color-text-muted)]">{props.children}</div>;
}

export function tabClass(active: boolean): string {
  return [
    "h-8 rounded-md text-sm transition-colors",
    active ? "bg-white text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-muted)]",
  ].join(" ");
}
