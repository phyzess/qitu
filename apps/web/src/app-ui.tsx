import type { ReactNode } from "react";
import { SectionHeader, StatusBadge, Surface, type AppShellNavItem } from "@qitu/ui";
import {
  Activity,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

export const nav: AppShellNavItem[] = [
  { label: "Overview", icon: <LayoutDashboard size={17} />, disabled: true },
  { label: "Sources", icon: <FileSpreadsheet size={17} />, disabled: true },
  { label: "Imports", icon: <Database size={17} />, disabled: true },
  { label: "Reviews", icon: <ListChecks size={17} />, active: true },
  { label: "Audit", icon: <ShieldCheck size={17} />, disabled: true },
];

export function Panel(props: { children: ReactNode }) {
  return <Surface className="p-[var(--s1)]">{props.children}</Surface>;
}

export function SectionTitle(props: { icon: ReactNode; label: string }) {
  return <SectionHeader icon={props.icon} title={props.label} />;
}

export function AuthLinkLayout(props: {
  badge: string;
  children: ReactNode;
  description: string;
  notice: string;
  title: string;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-[var(--gutter)] md:grid-cols-[1fr_0.8fr]">
      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <StatusBadge tone="warning">{props.badge}</StatusBadge>
            <h1 className="mt-3 text-[length:var(--text-heading-20)] font-semibold leading-[var(--leading-heading-20)]">
              {props.title}
            </h1>
            <div className="mt-2 max-w-[36rem] text-[length:var(--text-copy-14)] leading-[var(--leading-copy-14)] text-[var(--muted)]">
              {props.description}
            </div>
          </div>
          <LockKeyhole size={18} className="text-[var(--green)]" />
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
    <div className="qitu-surface-subtle flex items-center justify-between gap-3 px-3 py-2">
      <div className="text-[length:var(--text-label-13)] leading-[var(--leading-label-13)] text-[var(--muted)]">
        {props.label}
      </div>
      <div className="qitu-number text-[length:var(--text-label-12)] leading-[var(--leading-label-12)] text-[var(--text)]">
        {props.value}
      </div>
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
      <span className="text-[length:var(--text-label-12)] leading-[var(--leading-label-12)] text-[var(--muted)]">
        {props.label}
      </span>
      <input
        className="mt-2 block h-10 w-full rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3 text-[length:var(--text-copy-14)] text-[var(--text)] outline-none shadow-[0_0_0_1px_var(--line)] transition-[background,box-shadow] duration-300 ease-[var(--ease)] placeholder:text-[var(--dim)] focus:bg-[var(--surface-3)] focus:shadow-[0_0_0_2px_var(--green)]"
        onChange={(event) => props.onChange(event.target.value)}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

export function ErrorText(props: { children: ReactNode }) {
  return (
    <div className="mt-4 text-[length:var(--text-copy-13)] text-[var(--red)]">{props.children}</div>
  );
}

export function EmptyText(props: { children: ReactNode }) {
  return (
    <div className="text-[length:var(--text-copy-13)] text-[var(--muted)]">{props.children}</div>
  );
}

export function tabClass(active: boolean): string {
  return [
    "h-8 rounded-[var(--radius-sm)] text-[length:var(--text-label-13)] transition-[background,box-shadow,color] duration-300 ease-[var(--ease)]",
    active
      ? "bg-[var(--surface-3)] text-[var(--text)] shadow-[0_0_0_1px_var(--line-strong)]"
      : "text-[var(--muted)] hover:bg-[rgb(255_255_255_/_0.04)] hover:text-[var(--text)]",
  ].join(" ");
}
