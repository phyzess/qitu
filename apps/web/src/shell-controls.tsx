import { useEffect, useMemo, useRef } from "react";
import {
  AnimatedIcon,
  Button,
  cn,
  DialogClose,
  DialogContent,
  DialogRoot,
  Input,
  MenuContent,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
  PanelActionButton,
  StatusBadge,
} from "@qitu/ui";
import { ArrowRight, ChevronDown, X } from "lucide-react";
import { routePath, type AppNavigationPath } from "./app-routes";
import { localeOptions, useI18n, type Locale } from "./i18n";
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
      <AnimatedIcon name="theme" size={15} />
      {props.compact ? null : <span>{t("theme.title")}</span>}
    </Button>
  );
}

export function LanguageSelector(props: {
  className?: string | undefined;
  compact?: boolean | undefined;
}) {
  const { locale, localeMeta, setLocale, t } = useI18n();
  const currentLabel = t("language.current", { label: localeMeta.label });
  const title = `${t("language.choose")}. ${currentLabel}`;

  return (
    <MenuRoot modal={false}>
      <MenuTrigger
        render={
          <Button
            aria-label={title}
            className={cn(props.compact ? "size-8 px-0" : undefined, props.className)}
            size="sm"
            title={title}
            variant="ghost"
          >
            <AnimatedIcon name="language" size={15} />
            <span className={props.compact ? "sr-only" : undefined}>
              {props.compact ? t("language.choose") : localeMeta.shortLabel}
            </span>
            {props.compact ? null : <ChevronDown aria-hidden="true" size={13} />}
          </Button>
        }
      />
      <MenuContent aria-label={t("language.menuTitle")} className="w-44">
        <MenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            globalThis.setTimeout(() => setLocale(value as Locale), 0);
          }}
        >
          <MenuGroupLabel>{currentLabel}</MenuGroupLabel>
          {localeOptions.map((option) => {
            const selected = option.id === locale;
            return (
              <MenuRadioItem
                aria-label={
                  selected ? t("language.optionSelected", { label: option.label }) : option.label
                }
                className="min-h-9 w-full px-2 py-1"
                key={option.id}
                value={option.id}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--qitu-text-label-13)] font-medium leading-[var(--qitu-leading-label-14)]">
                    {option.label}
                  </span>
                  <span className="block text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
                    {option.id}
                  </span>
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuContent>
    </MenuRoot>
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

  return (
    <DialogRoot open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogContent
        aria-label={t("search.title")}
        className="fixed left-1/2 top-[10vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden"
        initialFocus={inputRef}
      >
        <div className="flex items-center gap-3 bg-[var(--qitu-surface-row)] px-[var(--qitu-space-s1)] py-[var(--qitu-space-s0)]">
          <AnimatedIcon className="shrink-0 text-[var(--qitu-dim)]" name="search" size={16} />
          <Input
            ref={inputRef}
            className="qitu-command-input"
            placeholder={t("search.placeholder")}
            value={props.query}
            onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          />
          <DialogClose
            render={
              <Button
                aria-label={t("action.closeSearch")}
                className="size-8 px-0"
                size="sm"
                title={t("action.closeSearch")}
                variant="ghost"
              >
                <X size={15} />
              </Button>
            }
          />
        </div>
        <div className="max-h-[min(520px,62vh)] overflow-y-auto p-2">
          {filteredEntries.length === 0 ? (
            <div className="grid min-h-28 place-items-center px-4 py-6 text-center text-[length:var(--qitu-text-copy-13)] text-[var(--qitu-muted)]">
              {t("search.empty")}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredEntries.map((entry) => (
                <PanelActionButton
                  data-search-entry-id={entry.id}
                  icon={<AnimatedIcon name="search" size={14} />}
                  key={entry.id}
                  label={entry.label}
                  trailing={<ArrowRight className="shrink-0 text-[var(--qitu-dim)]" size={14} />}
                  onClick={() => {
                    props.onOpenChange(false);
                    props.onQueryChange("");
                    entry.onSelect();
                  }}
                >
                  <span className="block truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
                    {t("search.descriptionSeparator", {
                      description: entry.description,
                      group: entry.group,
                    })}
                  </span>
                </PanelActionButton>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export function UserPanel(props: {
  canManageUsers: boolean;
  notice: string;
  onClose: () => void;
  onLogout: () => void;
  onNavigate: (path: AppNavigationPath) => void;
  open: boolean;
  runtimeEnvironment: string;
  user: ApiUser;
}) {
  const { formatStatus, roleLabel, t } = useI18n();

  const displayName = props.user.displayName ?? props.user.email;
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <DialogRoot modal={false} open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        aria-label={t("user.openPanel", { name: displayName })}
        backdropClassName="qitu-dismiss-layer qitu-transparent-backdrop"
        className="fixed right-[var(--qitu-layout-gutter)] top-[calc(var(--qitu-size-bar)+var(--qitu-space-s2))] w-[min(24rem,calc(100vw-2rem))] overflow-hidden"
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
        </div>

        <div className="grid gap-1 p-2">
          <PanelActionButton
            description={t("user.accountDescription")}
            icon={<AnimatedIcon name="settings" size={15} />}
            label={t("user.accountSettings")}
            trailing={<ArrowRight className="shrink-0 text-[var(--qitu-dim)]" size={14} />}
            onClick={() => {
              props.onClose();
              props.onNavigate(routePath("account"));
            }}
          />
          {props.canManageUsers ? (
            <PanelActionButton
              description={t("user.managementDescription")}
              icon={<AnimatedIcon name="users" size={15} />}
              label={t("user.managementTitle")}
              trailing={<ArrowRight className="shrink-0 text-[var(--qitu-dim)]" size={14} />}
              onClick={() => {
                props.onClose();
                props.onNavigate(routePath("users"));
              }}
            />
          ) : null}
          <div className="px-2 py-1">
            <div className="truncate text-[length:var(--qitu-text-label-12)] leading-[var(--qitu-leading-label-12)] text-[var(--qitu-dim)]">
              {props.notice}
            </div>
          </div>
          <div className="mt-1 rounded-[var(--qitu-radius-md)] bg-[var(--qitu-surface-row)] p-1">
            <Button
              className="w-full justify-start"
              size="sm"
              variant="ghost"
              onClick={props.onLogout}
            >
              <AnimatedIcon name="logout" size={15} /> {t("action.logout")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
