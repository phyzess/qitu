import { useState, type ReactNode } from "react";
import { Activity, Search } from "lucide-react";
import { cn } from "./utils";

export type AppShellNavItem = {
  label: string;
  active?: boolean;
  href?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
};

export type AppShellProps = {
  brand: string;
  navigation: AppShellNavItem[];
  subNavigation?: AppShellNavItem[] | undefined;
  actions?: ReactNode;
  children: ReactNode;
  commandLabel?: string;
  commandShortcutLabel?: string;
  eyebrow?: string;
  onCommand?: (() => void) | undefined;
};

export function AppShell({
  actions,
  brand,
  children,
  commandLabel = "Search workspace",
  commandShortcutLabel = "K",
  eyebrow,
  navigation,
  onCommand,
  subNavigation = [],
}: AppShellProps) {
  const activePrimaryIndex = Math.max(
    navigation.findIndex((item) => item.active),
    0,
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const targetIndex = hoverIndex ?? focusIndex ?? activePrimaryIndex;
  const targetPrimaryItem =
    navigation[targetIndex] ?? navigation[activePrimaryIndex] ?? navigation[0];
  const activeItem =
    subNavigation.find((item) => item.active) ?? targetPrimaryItem ?? navigation[0];
  const commandContent = (
    <>
      <Search aria-hidden="true" size={15} />
      <span className="qitu-command-label min-w-0 truncate">{commandLabel}</span>
      <kbd className="qitu-command-kbd">{commandShortcutLabel}</kbd>
    </>
  );

  return (
    <div className="qitu-workbench">
      <header className="qitu-topbar">
        <div className="qitu-topbar-main">
          <div className="qitu-brand-lockup">
            <div aria-hidden="true" className="qitu-brand-mark" />
            <div className="qitu-brand-copy">
              <strong className="qitu-brand-name">{brand}</strong>
              <span className="qitu-brand-context">
                {activeItem?.label ?? "Workspace"}
                {eyebrow ? ` / ${eyebrow}` : ""}
              </span>
            </div>
          </div>

          <div className="qitu-navigation-stack">
            <nav aria-label="Primary navigation" className="qitu-primary-nav">
              <div className="qitu-primary-nav-track" onMouseLeave={() => setHoverIndex(null)}>
                {navigation.map((item, index) => (
                  <PrimaryNavButton
                    index={index}
                    item={item}
                    key={item.label}
                    onFocusIndex={setFocusIndex}
                    onHoverIndex={setHoverIndex}
                  />
                ))}
                {navigation.length > 0 ? (
                  <>
                    <span aria-hidden="true" className="qitu-primary-divider" />
                    <span aria-live="polite" className="qitu-primary-live-label">
                      {targetPrimaryItem?.label}
                    </span>
                  </>
                ) : null}
              </div>
            </nav>

            {subNavigation.length > 1 ? (
              <nav aria-label="Section navigation" className="qitu-subnav">
                {subNavigation.map((item) => (
                  <SubNavButton item={item} key={item.label} />
                ))}
              </nav>
            ) : null}
          </div>

          <div className="qitu-topbar-actions">
            {onCommand ? (
              <button
                aria-label={commandLabel}
                className="qitu-command"
                onClick={onCommand}
                title={commandLabel}
                type="button"
              >
                {commandContent}
              </button>
            ) : (
              <div className="qitu-command" role="search" title={commandLabel}>
                {commandContent}
              </div>
            )}
            {actions}
          </div>
        </div>
      </header>
      <main className="qitu-main">{children}</main>
    </div>
  );
}

function SubNavButton(props: { item: AppShellNavItem }) {
  const content = <span>{props.item.label}</span>;

  if (props.item.href) {
    return (
      <a
        aria-current={props.item.active ? "page" : undefined}
        className="qitu-subnav-button"
        data-active={props.item.active ? "true" : "false"}
        href={props.item.href}
        onClick={(event) => {
          if (!props.item.onSelect || props.item.disabled) return;
          event.preventDefault();
          props.item.onSelect();
        }}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      aria-current={props.item.active ? "page" : undefined}
      className="qitu-subnav-button"
      data-active={props.item.active ? "true" : "false"}
      disabled={props.item.disabled}
      onClick={props.item.onSelect}
      type="button"
    >
      {content}
    </button>
  );
}

function PrimaryNavButton(props: {
  index: number;
  item: AppShellNavItem;
  onFocusIndex: (index: number | null) => void;
  onHoverIndex: (index: number | null) => void;
}) {
  const content = props.item.icon ?? (
    <span aria-hidden="true" className="qitu-primary-fallback">
      {props.item.label.slice(0, 2)}
    </span>
  );
  const className = cn(
    "qitu-primary-button qitu-button-press",
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
        onBlur={() => props.onFocusIndex(null)}
        onClick={(event) => {
          if (!props.item.onSelect || props.item.disabled) return;
          event.preventDefault();
          props.item.onSelect();
        }}
        onFocus={() => props.onFocusIndex(props.index)}
        onMouseEnter={() => props.onHoverIndex(props.index)}
        title={props.item.label}
      >
        <span aria-hidden="true" className="qitu-primary-icon">
          {content}
        </span>
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
      onBlur={() => props.onFocusIndex(null)}
      onFocus={() => props.onFocusIndex(props.index)}
      onMouseEnter={() => props.onHoverIndex(props.index)}
      onClick={props.item.onSelect}
      title={props.item.label}
      type="button"
    >
      <span aria-hidden="true" className="qitu-primary-icon">
        {content}
      </span>
    </button>
  );
}

export function SystemActivityIcon() {
  return <Activity aria-hidden="true" size={16} />;
}
