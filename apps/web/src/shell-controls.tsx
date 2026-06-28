import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Button, cn, StatusBadge } from "@qitu/ui";
import { ArrowRight, Laptop, LogOut, Moon, Search, Settings, Sun, UserCog, X } from "lucide-react";
import { useTheme } from "./theme";
import type { ApiUser } from "./types";

export type SearchEntry = {
  description: string;
  group: string;
  id: string;
  label: string;
  onSelect: () => void;
};

export function ThemeToggleButton(props: {
  className?: string | undefined;
  compact?: boolean | undefined;
}) {
  const theme = useTheme();
  const label =
    theme.preference === "system"
      ? `System ${theme.resolvedTheme}`
      : theme.preference === "dark"
        ? "Dark theme"
        : "Light theme";
  const Icon = theme.preference === "system" ? Laptop : theme.resolvedTheme === "dark" ? Moon : Sun;

  return (
    <Button
      aria-label={`Switch theme. Current: ${label}`}
      className={cn(props.compact ? "size-8 px-0" : undefined, props.className)}
      size="sm"
      title={`Switch theme. Current: ${label}`}
      variant="ghost"
      onClick={theme.cyclePreference}
    >
      <Icon size={15} />
      {props.compact ? null : <span>Theme</span>}
    </Button>
  );
}

export function WorkspaceSearchDialog(props: {
  entries: SearchEntry[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filteredEntries = useMemo(() => {
    const query = props.query.trim().toLowerCase();
    if (!query) return props.entries.slice(0, 12);

    return props.entries
      .filter((entry) =>
        [entry.label, entry.description, entry.group].some((value) =>
          value.toLowerCase().includes(query),
        ),
      )
      .slice(0, 12);
  }, [props.entries, props.query]);

  useEffect(() => {
    if (!props.open) return;

    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        props.onOpenChange(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.open, props.onOpenChange]);

  if (!props.open) return null;

  return (
    <div
      className="qitu-overlay-backdrop fixed inset-0 grid place-items-start px-4 py-[10vh]"
      role="presentation"
      onMouseDown={() => props.onOpenChange(false)}
    >
      <section
        aria-label="Search workspace"
        className="qitu-surface qitu-overlay-surface mx-auto w-full max-w-2xl overflow-hidden"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-[var(--s1)] py-[var(--s0)]">
          <Search aria-hidden="true" className="shrink-0 text-[var(--dim)]" size={16} />
          <input
            ref={inputRef}
            className="h-10 min-w-0 flex-1 bg-transparent text-[length:var(--text-copy-14)] text-[var(--text)] outline-none placeholder:text-[var(--dim)]"
            placeholder="Search routes, source files, jobs, users, or audit events"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
          <Button
            aria-label="Close search"
            className="size-8 px-0"
            size="sm"
            title="Close search"
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
          >
            <X size={15} />
          </Button>
        </div>
        <div className="max-h-[min(520px,62vh)] overflow-y-auto p-2">
          {filteredEntries.length === 0 ? (
            <div className="grid min-h-28 place-items-center px-4 py-6 text-center text-[length:var(--text-copy-13)] text-[var(--muted)]">
              No matching workspace item
            </div>
          ) : (
            <div className="space-y-1">
              {filteredEntries.map((entry) => (
                <button
                  className="qitu-panel-action w-full text-left"
                  data-search-entry-id={entry.id}
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    props.onOpenChange(false);
                    props.onQueryChange("");
                    entry.onSelect();
                  }}
                >
                  <span className="qitu-icon-chip size-8">
                    <Search size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--text-label-14)] font-medium leading-[var(--leading-label-14)]">
                      {entry.label}
                    </span>
                    <span className="block truncate text-[length:var(--text-label-12)] leading-[var(--leading-label-12)] text-[var(--dim)]">
                      {entry.group} / {entry.description}
                    </span>
                  </span>
                  <ArrowRight className="shrink-0 text-[var(--dim)]" size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function UserPanel(props: {
  canManageUsers: boolean;
  notice: string;
  onClose: () => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  open: boolean;
  runtimeEnvironment: string;
  user: ApiUser;
}) {
  if (!props.open) return null;

  const displayName = props.user.displayName ?? props.user.email;
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <>
      <div
        className="qitu-dismiss-layer fixed inset-0"
        role="presentation"
        onMouseDown={props.onClose}
      />
      <section
        aria-label="User panel"
        aria-modal="true"
        className="qitu-surface qitu-overlay-surface fixed right-[var(--gutter)] top-[calc(var(--bar)+var(--s2))] w-[min(24rem,calc(100vw-2rem))] overflow-hidden"
        role="dialog"
      >
        <div className="flex items-start gap-3 border-b border-[var(--line)] p-[var(--s1)]">
          <div className="qitu-avatar-mark size-10 shrink-0 text-[length:var(--text-label-14)] font-semibold">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[length:var(--text-label-14)] font-semibold leading-[var(--leading-label-14)]">
              {displayName}
            </div>
            <div className="truncate text-[length:var(--text-label-12)] leading-[var(--leading-label-12)] text-[var(--dim)]">
              {props.user.email}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge tone="active">{props.user.role}</StatusBadge>
              <StatusBadge tone="neutral">{props.runtimeEnvironment}</StatusBadge>
            </div>
          </div>
          <Button
            aria-label="Close user panel"
            className="size-8 px-0"
            size="sm"
            title="Close user panel"
            variant="ghost"
            onClick={props.onClose}
          >
            <X size={15} />
          </Button>
        </div>

        <div className="grid gap-1 p-2">
          <PanelAction
            description="Session, role, and account details"
            icon={<Settings size={15} />}
            label="Account settings"
            onClick={() => {
              props.onClose();
              props.onNavigate("/account");
            }}
          />
          {props.canManageUsers ? (
            <PanelAction
              description="Users, roles, and invitations"
              icon={<UserCog size={15} />}
              label="User management"
              onClick={() => {
                props.onClose();
                props.onNavigate("/users");
              }}
            />
          ) : null}
          <div className="px-2 py-1">
            <div className="truncate text-[length:var(--text-label-12)] leading-[var(--leading-label-12)] text-[var(--dim)]">
              {props.notice}
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--line)] px-2 py-2">
            <ThemeToggleButton />
            <Button size="sm" variant="ghost" onClick={props.onLogout}>
              <LogOut size={15} /> Logout
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

function PanelAction(props: {
  description: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="qitu-panel-action w-full text-left" type="button" onClick={props.onClick}>
      <span className="qitu-icon-chip size-8">{props.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--text-label-14)] font-medium leading-[var(--leading-label-14)]">
          {props.label}
        </span>
        <span className="block truncate text-[length:var(--text-label-12)] leading-[var(--leading-label-12)] text-[var(--dim)]">
          {props.description}
        </span>
      </span>
      <ArrowRight className="shrink-0 text-[var(--dim)]" size={14} />
    </button>
  );
}
