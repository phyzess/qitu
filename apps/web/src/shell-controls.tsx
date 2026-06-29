import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, cn, StatusBadge } from "@qitu/ui";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Languages,
  Laptop,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  UserCog,
  X,
} from "lucide-react";
import { localeOptions, useI18n } from "./i18n";
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
  const { t } = useI18n();
  const theme = useTheme();
  const label =
    theme.preference === "system"
      ? t("theme.system", { theme: theme.resolvedTheme })
      : theme.preference === "dark"
        ? t("theme.dark")
        : t("theme.light");
  const Icon = theme.preference === "system" ? Laptop : theme.resolvedTheme === "dark" ? Moon : Sun;
  const title = t("theme.switchWithCurrent", { label });

  return (
    <Button
      aria-label={title}
      className={cn(props.compact ? "size-8 px-0" : undefined, props.className)}
      size="sm"
      title={title}
      variant="ghost"
      onClick={theme.cyclePreference}
    >
      <Icon size={15} />
      {props.compact ? null : <span>{t("theme.title")}</span>}
    </Button>
  );
}

export function LanguageSelector(props: {
  className?: string | undefined;
  compact?: boolean | undefined;
}) {
  const { locale, localeMeta, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentLabel = t("language.current", { label: localeMeta.label });
  const title = `${t("language.choose")}. ${currentLabel}`;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={title}
        className={cn(props.compact ? "size-8 px-0" : undefined, props.className)}
        size="sm"
        title={title}
        variant="ghost"
        onClick={() => setOpen((current) => !current)}
      >
        <Languages size={15} />
        <span className={props.compact ? "sr-only" : undefined}>
          {props.compact ? t("language.choose") : localeMeta.shortLabel}
        </span>
        {props.compact ? null : <ChevronDown aria-hidden="true" size={13} />}
      </Button>
      {open ? (
        <div
          aria-label={t("language.menuTitle")}
          className="qitu-surface qitu-overlay-surface absolute right-0 top-[calc(100%+var(--qitu-space-s0))] z-[var(--qitu-z-overlay)] w-44 overflow-hidden p-1"
          role="menu"
        >
          <div className="px-2 py-1 text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
            {currentLabel}
          </div>
          {localeOptions.map((option) => {
            const selected = option.id === locale;
            return (
              <button
                aria-label={
                  selected ? t("language.optionSelected", { label: option.label }) : option.label
                }
                aria-checked={selected}
                className="qitu-panel-action min-h-9 w-full px-2 py-1 text-left"
                key={option.id}
                role="menuitemradio"
                type="button"
                onClick={() => {
                  setLocale(option.id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--qitu-text-label-13)] font-medium leading-[var(--qitu-leading-label-14)]">
                    {option.label}
                  </span>
                  <span className="block text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
                    {option.id}
                  </span>
                </span>
                {selected ? (
                  <Check className="shrink-0 text-[var(--qitu-chroma-active)]" size={14} />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceSearchDialog(props: {
  entries: SearchEntry[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useI18n();
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
        aria-label={t("search.title")}
        className="qitu-surface qitu-overlay-surface mx-auto w-full max-w-2xl overflow-hidden"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 bg-[var(--qitu-surface-row)] px-[var(--qitu-space-s1)] py-[var(--qitu-space-s0)]">
          <Search aria-hidden="true" className="shrink-0 text-[var(--qitu-dim)]" size={16} />
          <input
            ref={inputRef}
            className="h-10 min-w-0 flex-1 bg-transparent text-[length:var(--qitu-text-copy-14)] text-[var(--qitu-text)] outline-none placeholder:text-[var(--qitu-dim)]"
            placeholder={t("search.placeholder")}
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
          <Button
            aria-label={t("action.closeSearch")}
            className="size-8 px-0"
            size="sm"
            title={t("action.closeSearch")}
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
          >
            <X size={15} />
          </Button>
        </div>
        <div className="max-h-[min(520px,62vh)] overflow-y-auto p-2">
          {filteredEntries.length === 0 ? (
            <div className="grid min-h-28 place-items-center px-4 py-6 text-center text-[length:var(--qitu-text-copy-13)] text-[var(--qitu-muted)]">
              {t("search.empty")}
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
                    <span className="block truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
                      {entry.label}
                    </span>
                    <span className="block truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
                      {t("search.descriptionSeparator", {
                        description: entry.description,
                        group: entry.group,
                      })}
                    </span>
                  </span>
                  <ArrowRight className="shrink-0 text-[var(--qitu-dim)]" size={14} />
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
  const { formatStatus, roleLabel, t } = useI18n();

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
        aria-label={t("user.openPanel", { name: displayName })}
        aria-modal="true"
        className="qitu-surface qitu-overlay-surface fixed right-[var(--qitu-layout-gutter)] top-[calc(var(--qitu-size-bar)+var(--qitu-space-s2))] w-[min(24rem,calc(100vw-2rem))] overflow-hidden"
        role="dialog"
      >
        <div className="flex items-start gap-3 bg-[var(--qitu-surface-row)] p-[var(--qitu-space-s1)]">
          <div className="qitu-avatar-mark size-10 shrink-0 text-[length:var(--qitu-text-label-14)] font-semibold">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[length:var(--qitu-text-label-14)] font-semibold leading-[var(--qitu-leading-label-14)]">
              {displayName}
            </div>
            <div className="truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
              {props.user.email}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge tone="active">{roleLabel(props.user.role)}</StatusBadge>
              <StatusBadge tone="neutral">{formatStatus(props.runtimeEnvironment)}</StatusBadge>
            </div>
          </div>
          <Button
            aria-label={t("action.closeUserPanel")}
            className="size-8 px-0"
            size="sm"
            title={t("action.closeUserPanel")}
            variant="ghost"
            onClick={props.onClose}
          >
            <X size={15} />
          </Button>
        </div>

        <div className="grid gap-1 p-2">
          <PanelAction
            description={t("user.accountDescription")}
            icon={<Settings size={15} />}
            label={t("user.accountSettings")}
            onClick={() => {
              props.onClose();
              props.onNavigate("/account");
            }}
          />
          {props.canManageUsers ? (
            <PanelAction
              description={t("user.managementDescription")}
              icon={<UserCog size={15} />}
              label={t("user.managementTitle")}
              onClick={() => {
                props.onClose();
                props.onNavigate("/users");
              }}
            />
          ) : null}
          <div className="px-2 py-1">
            <div className="truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
              {props.notice}
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 rounded-[var(--qitu-radius-md)] bg-[var(--qitu-surface-row)] px-2 py-2">
            <div className="flex items-center gap-2">
              <ThemeToggleButton />
              <LanguageSelector />
            </div>
            <Button size="sm" variant="ghost" onClick={props.onLogout}>
              <LogOut size={15} /> {t("action.logout")}
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
        <span className="block truncate text-[length:var(--qitu-text-label-14)] font-medium leading-[var(--qitu-leading-label-14)]">
          {props.label}
        </span>
        <span className="block truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
          {props.description}
        </span>
      </span>
      <ArrowRight className="shrink-0 text-[var(--qitu-dim)]" size={14} />
    </button>
  );
}
