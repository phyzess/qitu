import type { ReactNode } from "react";

export type AppShellNavItem = {
  label: string;
  active?: boolean;
  download?: boolean | string;
  href?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  target?: string;
};

export type AppShellProps = {
  brand: string;
  navigation: AppShellNavItem[];
  subNavigation?: AppShellNavItem[] | undefined;
  actions?: ReactNode;
  children: ReactNode;
  contentKey?: string | undefined;
  contentTitle?: string | undefined;
  commandLabel?: string;
  commandShortcutLabel?: string;
  documentTitle?: string | undefined;
  eyebrow?: string;
  primaryNavigationLabel?: string | undefined;
  sectionNavigationLabel?: string | undefined;
  skipLinkLabel?: string | undefined;
  onCommand?: (() => void) | undefined;
};
