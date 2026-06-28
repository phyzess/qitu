import type { ReactNode } from "react";
import { Activity, Search } from "lucide-react";
import { cn } from "./utils";

export type AppShellNavItem = {
  label: string;
  active?: boolean;
  href?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type AppShellProps = {
  brand: string;
  navigation: AppShellNavItem[];
  actions?: ReactNode;
  children: ReactNode;
  commandLabel?: string;
  eyebrow?: string;
};

export function AppShell({
  actions,
  brand,
  children,
  commandLabel = "Search workspace",
  eyebrow,
  navigation,
}: AppShellProps) {
  const activeItem = navigation.find((item) => item.active) ?? navigation[0];

  return (
    <div className="qitu-workbench">
      <aside aria-label="Primary navigation" className="qitu-rail">
        <div className="qitu-rail-brand">
          <div aria-hidden="true" className="qitu-brand-mark" />
        </div>
        <nav className="qitu-rail-nav">
          {navigation.map((item) => (
            <NavButton item={item} key={item.label} />
          ))}
        </nav>
        <div className="qitu-rail-foot">
          <span aria-label="System healthy" className="qitu-health" role="status" />
        </div>
      </aside>

      <div className="qitu-workspace">
        <header className="qitu-topbar">
          <div className="flex min-w-0 items-center gap-[var(--s0)]">
            <div className="hidden min-w-0 items-center gap-[var(--s-2)] text-[length:var(--text-label-13)] leading-[var(--leading-label-13)] text-[var(--dim)] md:flex">
              <span>{brand}</span>
              <span>/</span>
              <strong className="min-w-0 truncate font-medium text-[var(--text)]">
                {activeItem?.label ?? "Workspace"}
              </strong>
              {eyebrow ? <span className="truncate">{eyebrow}</span> : null}
            </div>
            <div className="qitu-command" role="search">
              <Search aria-hidden="true" size={15} />
              <span className="min-w-0 truncate">{commandLabel}</span>
              <kbd className="rounded-[var(--radius-sm)] px-1.5 py-0.5 font-mono text-[length:var(--text-label-12)] text-[var(--muted)] shadow-[0_0_0_1px_var(--line)]">
                K
              </kbd>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        </header>
        <main className="qitu-main">{children}</main>
      </div>
    </div>
  );
}

function NavButton(props: { item: AppShellNavItem }) {
  const content = props.item.icon ?? (
    <span aria-hidden="true" className="text-[length:var(--text-label-12)] font-semibold">
      {props.item.label.slice(0, 2)}
    </span>
  );
  const className = cn(
    "qitu-rail-button qitu-button-press border-0 bg-transparent p-0",
    props.item.disabled && "pointer-events-none opacity-40",
  );

  if (props.item.href) {
    return (
      <a
        aria-current={props.item.active ? "page" : undefined}
        aria-label={props.item.label}
        className={className}
        data-active={props.item.active ? "true" : "false"}
        href={props.item.href}
        title={props.item.label}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      aria-current={props.item.active ? "page" : undefined}
      aria-label={props.item.label}
      className={className}
      data-active={props.item.active ? "true" : "false"}
      disabled={props.item.disabled}
      title={props.item.label}
      type="button"
    >
      {content}
    </button>
  );
}

export function SystemActivityIcon() {
  return <Activity aria-hidden="true" size={16} />;
}
