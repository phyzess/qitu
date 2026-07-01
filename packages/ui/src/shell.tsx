import { useState, type ReactNode } from "react";
import { AnimatedIcon } from "./animated-icon";
import { Button } from "./button";
import { CommandSearchFixture } from "./command-search-fixture";
import { QituMark } from "./qitu-mark";
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
    <CommandSearchFixture
      icon={<AnimatedIcon name="search" size={15} />}
      label={commandLabel}
      shortcut={commandShortcutLabel}
    />
  );

  return (
    <div className="qitu-workbench">
      <header className="qitu-topbar">
        <div className="qitu-topbar-main">
          <div className="qitu-brand-lockup">
            <div aria-hidden="true" className="qitu-brand-mark">
              <QituMark />
            </div>
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
              <Button
                aria-label={commandLabel}
                className="qitu-command"
                nativeButton
                onClick={onCommand}
                title={commandLabel}
                type="button"
                variant="ghost"
              >
                {commandContent}
              </Button>
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
        aria-disabled={props.item.disabled ? true : undefined}
        className="qitu-subnav-button"
        data-active={props.item.active ? "true" : "false"}
        data-disabled={props.item.disabled ? "true" : "false"}
        href={props.item.href}
        tabIndex={props.item.disabled ? -1 : undefined}
        onClick={(event) => {
          if (props.item.disabled) {
            event.preventDefault();
            return;
          }

          if (!props.item.onSelect) return;
          event.preventDefault();
          props.item.onSelect();
        }}
      >
        {content}
      </a>
    );
  }

  return (
    <Button
      aria-current={props.item.active ? "page" : undefined}
      className="qitu-subnav-button"
      data-active={props.item.active ? "true" : "false"}
      disabled={props.item.disabled}
      nativeButton
      onClick={props.item.onSelect}
      type="button"
      variant="ghost"
    >
      {content}
    </Button>
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
        aria-disabled={props.item.disabled ? true : undefined}
        aria-label={props.item.label}
        className={className}
        data-active={props.item.active ? "true" : "false"}
        data-disabled={props.item.disabled ? "true" : "false"}
        href={props.item.href}
        tabIndex={props.item.disabled ? -1 : undefined}
        onBlur={() => props.onFocusIndex(null)}
        onClick={(event) => {
          if (props.item.disabled) {
            event.preventDefault();
            return;
          }

          if (!props.item.onSelect) return;
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
    <Button
      aria-current={props.item.active ? "page" : undefined}
      aria-label={props.item.label}
      className={className}
      data-active={props.item.active ? "true" : "false"}
      disabled={props.item.disabled}
      nativeButton
      onBlur={() => props.onFocusIndex(null)}
      onFocus={() => props.onFocusIndex(props.index)}
      onMouseEnter={() => props.onHoverIndex(props.index)}
      onClick={props.item.onSelect}
      size="icon"
      title={props.item.label}
      type="button"
      variant="ghost"
    >
      <span aria-hidden="true" className="qitu-primary-icon">
        {content}
      </span>
    </Button>
  );
}

export function SystemActivityIcon() {
  return <AnimatedIcon name="activity" size={16} />;
}
