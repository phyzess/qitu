import type { ReactNode } from "react";
import { SectionHeader, StatusBadge, Surface, type AppShellNavItem } from "@qitu/ui";
import {
  Activity,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LockKeyhole,
  ShieldCheck,
  UserCog,
  UserRound,
} from "lucide-react";
import {
  type AppPrimaryRoute,
  primaryRouteFor,
  routePath,
  type AppRoute,
  type WorkspaceAppRoute,
} from "./app-routes";

export type WorkspaceRouteEntry = {
  description: string;
  group: string;
  label: string;
  path: string;
  route: WorkspaceAppRoute;
};

export type AppNavigationModel = {
  activePrimaryLabel: string;
  activeRouteLabel: string;
  primaryNavigation: AppShellNavItem[];
  routeEntries: WorkspaceRouteEntry[];
  subNavigation: AppShellNavItem[];
};

type NavigationGroup = {
  defaultRoute: WorkspaceAppRoute;
  icon: ReactNode;
  id: AppPrimaryRoute;
  label: string;
  routes: WorkspaceAppRoute[];
};

const routeMeta: Record<
  WorkspaceAppRoute,
  {
    description: string;
    icon: ReactNode;
    label: string;
  }
> = {
  overview: {
    description: "Authenticated workspace summary.",
    icon: <LayoutDashboard size={15} />,
    label: "Overview",
  },
  reviews: {
    description: "Review staged records and advisory output.",
    icon: <ListChecks size={15} />,
    label: "Reviews",
  },
  sources: {
    description: "Upload source files and inspect intake state.",
    icon: <FileSpreadsheet size={15} />,
    label: "Sources",
  },
  imports: {
    description: "Process import jobs and retry failures.",
    icon: <Database size={15} />,
    label: "Imports",
  },
  audit: {
    description: "Read compliance and security audit events.",
    icon: <ShieldCheck size={15} />,
    label: "Audit",
  },
  users: {
    description: "Manage users and local invitations.",
    icon: <UserCog size={15} />,
    label: "Users",
  },
  account: {
    description: "Review the current session and account profile.",
    icon: <UserRound size={15} />,
    label: "Account",
  },
};

const navigationGroups: NavigationGroup[] = [
  {
    defaultRoute: "reviews",
    icon: <LayoutDashboard size={17} />,
    id: "workbench",
    label: "Workbench",
    routes: ["overview", "reviews"],
  },
  {
    defaultRoute: "sources",
    icon: <FileSpreadsheet size={17} />,
    id: "intake",
    label: "Intake",
    routes: ["sources", "imports"],
  },
  {
    defaultRoute: "audit",
    icon: <ShieldCheck size={17} />,
    id: "governance",
    label: "Governance",
    routes: ["audit", "users"],
  },
  {
    defaultRoute: "account",
    icon: <UserRound size={17} />,
    id: "account",
    label: "Account",
    routes: ["account"],
  },
];

export function buildNavigation(
  route: AppRoute,
  options: {
    authenticated: boolean;
    canManageUsers?: boolean;
    onNavigate: (path: string) => void;
    resolvePrimaryRoute?: (
      primaryRoute: AppPrimaryRoute,
      fallbackRoute: WorkspaceAppRoute,
    ) => WorkspaceAppRoute;
  },
): AppNavigationModel {
  if (!options.authenticated) {
    return {
      activePrimaryLabel: "Login",
      activeRouteLabel: "Login",
      primaryNavigation: [
        {
          label: "Login",
          icon: <LogIn size={17} />,
          active: route === "login",
          href: routePath("login"),
          onSelect: () => options.onNavigate(routePath("login")),
        },
      ],
      routeEntries: [],
      subNavigation: [],
    };
  }

  const canManageUsers = Boolean(options.canManageUsers);
  const activeGroup =
    navigationGroups.find((group) => group.id === primaryRouteFor(route)) ?? navigationGroups[0]!;
  const primaryNavigation = navigationGroups.map((group) => {
    const rememberedRoute =
      options.resolvePrimaryRoute?.(group.id, group.defaultRoute) ?? group.defaultRoute;
    const targetRoute = routeAvailable(rememberedRoute, canManageUsers)
      ? rememberedRoute
      : group.defaultRoute;
    const href = routePath(targetRoute);

    return {
      label: group.label,
      icon: group.icon,
      href,
      active: activeGroup.id === group.id,
      onSelect: () => options.onNavigate(href),
    };
  });
  const subNavigation: AppShellNavItem[] = activeGroup.routes.map((routeId) => {
    const meta = routeMeta[routeId];
    const href = routePath(routeId);
    const disabled = !routeAvailable(routeId, canManageUsers);

    const item: AppShellNavItem = {
      label: meta.label,
      icon: meta.icon,
      href,
      active: route === routeId,
      disabled,
    };

    if (!disabled) {
      item.onSelect = () => options.onNavigate(href);
    }

    return item;
  });
  const routeEntries = navigationGroups.flatMap((group) =>
    group.routes
      .filter((routeId) => routeAvailable(routeId, canManageUsers))
      .map((routeId) => {
        const meta = routeMeta[routeId];
        return {
          description: meta.description,
          group: group.label,
          label: meta.label,
          path: routePath(routeId),
          route: routeId,
        };
      }),
  );
  const activeRoute = route !== "login" && route !== "not-found" ? routeMeta[route] : null;

  return {
    activePrimaryLabel: activeGroup.label,
    activeRouteLabel: activeRoute?.label ?? activeGroup.label,
    primaryNavigation,
    routeEntries,
    subNavigation,
  };
}

function routeAvailable(route: WorkspaceAppRoute, canManageUsers: boolean): boolean {
  return route !== "users" || canManageUsers;
}

export function Panel(props: { children: ReactNode }) {
  return <Surface className="p-[var(--qitu-space-s1)]">{props.children}</Surface>;
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
    <div className="mx-auto grid max-w-5xl gap-[var(--qitu-layout-gutter)] md:grid-cols-[1fr_0.8fr]">
      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div>
            <StatusBadge tone="warning">{props.badge}</StatusBadge>
            <h1 className="mt-3 text-[length:var(--qitu-text-heading-20)] font-semibold leading-[var(--qitu-leading-heading-20)]">
              {props.title}
            </h1>
            <div className="mt-2 max-w-[36rem] text-[length:var(--qitu-text-copy-14)] leading-[var(--qitu-leading-copy-14)] text-[var(--qitu-muted)]">
              {props.description}
            </div>
          </div>
          <LockKeyhole size={18} className="text-[var(--qitu-chroma-lime-ink)]" />
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
    <div className="qitu-readonly-field">
      <div className="qitu-readonly-label">{props.label}</div>
      <div className="qitu-readonly-value">{props.value}</div>
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
    <label className="qitu-form-field">
      <span className="qitu-form-label">{props.label}</span>
      <input
        className="qitu-field-control"
        onChange={(event) => props.onChange(event.target.value)}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

export function SelectField(props: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="qitu-form-field">
      <span className="qitu-form-label">{props.label}</span>
      <select
        className="qitu-field-control"
        onChange={(event) => props.onChange(event.target.value)}
        value={props.value}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ErrorText(props: { children: ReactNode }) {
  return (
    <div className="mt-4 text-[length:var(--qitu-text-copy-13)] text-[var(--qitu-red)]">
      {props.children}
    </div>
  );
}

export function EmptyText(props: { children: ReactNode }) {
  return (
    <div className="text-[length:var(--qitu-text-copy-13)] text-[var(--qitu-muted)]">
      {props.children}
    </div>
  );
}

export function tabClass(active: boolean): string {
  return ["qitu-segment-tab", active ? "qitu-segment-tab-active" : ""].join(" ");
}
